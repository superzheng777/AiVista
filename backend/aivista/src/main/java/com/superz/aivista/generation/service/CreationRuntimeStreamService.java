package com.superz.aivista.generation.service;

import com.superz.aivista.generation.config.GenerationWorkerApiProperties;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** One internal socket per active user. Never accumulates text or owns an Agent execution. */
@Service
public class CreationRuntimeStreamService {
    private final Map<Long, Channel> channels = new ConcurrentHashMap<>();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final URI uri;
    private final GenerationWorkerApiProperties properties;
    private final UserEventConnections users;
    private final CreationImageService images;
    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private volatile boolean stopped;

    public CreationRuntimeStreamService(@Value("${app.creation-runtime.base-url:http://127.0.0.1:8890}") String baseUrl,
            GenerationWorkerApiProperties properties, UserEventConnections users, CreationImageService images,
            JdbcTemplate jdbc, JsonMapper json) {
        this.uri = URI.create(baseUrl.replaceFirst("^http", "ws") + "/internal/events");
        this.properties = properties; this.users = users; this.images = images; this.jdbc = jdbc; this.json = json;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void restoreAll() {
        jdbc.query("""
            SELECT DISTINCT e.user_id FROM executions e WHERE e.kind='CREATION' AND
            (e.status IN ('QUEUED','RUNNING','WAITING_INPUT') OR EXISTS (SELECT 1 FROM executions child
             WHERE child.parent_id=e.id AND child.status IN ('QUEUED','RUNNING')))
            """,
            (org.springframework.jdbc.core.RowCallbackHandler) row -> restore(row.getLong(1)));
    }

    public void restore(long userId) {
        for (Long id : jdbc.queryForList("""
                SELECT e.id FROM executions e JOIN generation_sessions s ON s.id=e.session_id
                WHERE e.user_id=? AND e.kind='CREATION' AND s.deleted_at IS NULL AND
                (e.status IN ('QUEUED','RUNNING','WAITING_INPUT') OR EXISTS (SELECT 1 FROM executions child
                 WHERE child.parent_id=e.id AND child.status IN ('QUEUED','RUNNING')))
                """, Long.class, userId)) watch(userId, id);
    }

    public void watch(long userId, long creationId) {
        if (stopped || jdbc.queryForObject("""
                SELECT COUNT(*) FROM executions e JOIN generation_sessions s ON s.id=e.session_id
                WHERE e.id=? AND e.user_id=? AND e.kind='CREATION' AND s.deleted_at IS NULL
                """, Integer.class, creationId, userId) != 1) return;
        // A terminal event can retire a channel while a new creation is being accepted.
        while (!stopped) {
            Channel channel = channels.computeIfAbsent(userId, Channel::new);
            synchronized (channel) {
                if (channels.get(userId) != channel) continue;
                channel.ids.add(Long.toString(creationId));
                channel.start();
                channel.sync();
                return;
            }
        }
    }

    public void forgetSession(long userId, long sessionId) {
        Channel channel = channels.get(userId);
        if (channel == null) return;
        var removed = jdbc.queryForList("SELECT id FROM executions WHERE user_id=? AND session_id=? AND kind='CREATION'",
            Long.class, userId, sessionId).stream().map(Object::toString).toList();
        synchronized (channel) {
            channel.ids.removeAll(removed); channel.terminalIds.removeAll(removed);
            if (channel.ids.isEmpty()) channel.finish();
        }
    }

    private final class Channel implements WebSocket.Listener {
        final long userId;
        final Set<String> ids = ConcurrentHashMap.newKeySet();
        final Set<String> terminalIds = ConcurrentHashMap.newKeySet();
        final StringBuilder frame = new StringBuilder();
        volatile WebSocket socket;
        boolean connecting;
        boolean ready;
        int attempt;
        volatile long lastSeen = System.nanoTime();
        ScheduledFuture<?> reconnect;
        final ScheduledFuture<?> heartbeat;
        CompletableFuture<WebSocket> sending;

        Channel(long userId) {
            this.userId = userId;
            this.heartbeat = scheduler.scheduleWithFixedDelay(() -> {
                synchronized (this) {
                    if (socket == null) return;
                    if (System.nanoTime() - lastSeen > Duration.ofSeconds(45).toNanos()) { socket.abort(); disconnected(); }
                    else socket.sendPing(ByteBuffer.wrap(new byte[] {1})).exceptionally(error -> { disconnected(); return null; });
                }
            }, 15, 15, TimeUnit.SECONDS);
        }

        synchronized void start() {
            if (stopped || ids.isEmpty() || socket != null || connecting || (reconnect != null && !reconnect.isDone())) return;
            connecting = true;
            http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5))
                .header("X-AiVista-Worker-Token", properties.token()).header("X-AiVista-User-Id", Long.toString(userId))
                .buildAsync(uri, this).whenComplete((connected, error) -> { if (error != null) disconnected(); });
        }

        @Override public synchronized void onOpen(WebSocket connected) {
            if (stopped || channels.get(userId) != this) { connected.abort(); return; }
            socket = connected; sending = CompletableFuture.completedFuture(connected); connecting = false;
            lastSeen = System.nanoTime(); connected.request(1);
        }

        synchronized void sync() {
            if (!ready || socket == null || ids.isEmpty()) return;
            String body = json.writeValueAsString(Map.of("type", "sync", "creationIds", new ArrayList<>(ids)));
            if (body.length() > 65_536) { disconnected(); return; }
            WebSocket current = socket;
            sending = sending.thenCompose(ignored -> current.sendText(body, true));
            sending.exceptionally(error -> { disconnected(); return null; });
        }

        @Override public CompletionStage<?> onText(WebSocket source, CharSequence text, boolean last) {
            try {
                synchronized (this) {
                    if (source != socket) return CompletableFuture.completedFuture(null);
                    lastSeen = System.nanoTime(); frame.append(text);
                    if (frame.length() > 1_048_576) throw new IllegalArgumentException("Runtime frame exceeds limit");
                    if (last) { String body = frame.toString(); frame.setLength(0); receive(body); }
                }
            } catch (RuntimeException error) { source.abort(); disconnected(); }
            finally { source.request(1); }
            return CompletableFuture.completedFuture(null);
        }

        void receive(String body) {
            JsonNode event = json.readTree(body);
            String type = event.path("type").asText();
            if ("runtime.ready".equals(type)) { ready = true; attempt = 0; sync(); return; }
            if (!List.of("creation.updated", "creation.item.upserted", "creation.text.delta", "creation.snapshot").contains(type)) return;
            if (!Long.toString(userId).equals(event.path("userId").asText())) throw new IllegalArgumentException("Runtime user mismatch");
            String id = event.path("creationId").asText();
            if (!ids.contains(id)) return;
            users.broadcast(userId, images.signDisplay(event));
            String status = "creation.snapshot".equals(type) ? event.path("turn").path("status").asText() : event.path("status").asText();
            boolean terminal = List.of("SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED").contains(status);
            if (terminal) terminalIds.add(id);
            boolean imageSettled = "creation.item.upserted".equals(type) && "generation".equals(event.path("item").path("kind").asText())
                && List.of("SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED").contains(event.path("item").path("status").asText());
            // SQL can already be terminal while Pi is still emitting final items/status.
            // An image result must not retire the route before that parent terminal event is delivered.
            if ((terminal || (imageSettled && terminalIds.contains(id))) && jdbc.queryForObject("""
                SELECT COUNT(*) FROM executions WHERE (id=? OR parent_id=?) AND status IN ('QUEUED','RUNNING','WAITING_INPUT')
                """, Integer.class, Long.parseLong(id), Long.parseLong(id)) == 0) {
                ids.remove(id); terminalIds.remove(id); if (ids.isEmpty()) finish();
            }
        }

        @Override public CompletionStage<?> onPong(WebSocket source, ByteBuffer data) { lastSeen = System.nanoTime(); source.request(1); return null; }
        @Override public CompletionStage<?> onPing(WebSocket source, ByteBuffer data) { lastSeen = System.nanoTime(); source.request(1); return source.sendPong(data); }
        @Override public CompletionStage<?> onClose(WebSocket source, int code, String reason) { if (source == socket) disconnected(); return null; }
        @Override public void onError(WebSocket source, Throwable error) { if (source == socket) disconnected(); }

        synchronized void disconnected() {
            if (socket != null) socket.abort();
            socket = null; connecting = false; ready = false; frame.setLength(0);
            if (stopped || ids.isEmpty() || channels.get(userId) != this || (reconnect != null && !reconnect.isDone())) return;
            long delay = Math.min(15_000, 1000L << Math.min(attempt++, 4)) + ThreadLocalRandom.current().nextLong(250);
            reconnect = scheduler.schedule(() -> { synchronized (this) { reconnect = null; } start(); }, delay, TimeUnit.MILLISECONDS);
        }

        synchronized void finish() {
            channels.remove(userId, this); heartbeat.cancel(false);
            if (reconnect != null) reconnect.cancel(false);
            if (socket != null) socket.sendClose(1000, "All creations finished");
            socket = null; ready = false;
        }
    }

    @PreDestroy public void close() {
        stopped = true;
        for (Channel channel : channels.values()) channel.finish();
        scheduler.shutdownNow();
    }
}
