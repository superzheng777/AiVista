package com.superz.aivista.generation.service;

import com.superz.aivista.auth.token.AccessTokenClaims;
import com.superz.aivista.auth.token.JwtService;
import com.superz.aivista.generation.config.UserEventProperties;
import com.superz.aivista.publication.event.PublicationStatusEvent;
import com.superz.aivista.user.event.InteractionNotificationCreatedEvent;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** One authenticated user channel per browser tab; no creation text is accumulated here. */
@Service
public class UserEventConnections extends TextWebSocketHandler {
    private final Map<String, Client> clients = new ConcurrentHashMap<>();
    private final UserEventProperties properties;
    private final Clock clock;
    private final JwtService jwt;
    private final JsonMapper json;
    private final ObjectProvider<CreationRuntimeStreamService> runtime;
    private final GenerationConsentService consent;
    private static final CloseStatus RETRY = new CloseStatus(1013, "Connection limit or slow consumer");

    public UserEventConnections(UserEventProperties properties, Clock clock, JwtService jwt,
            JsonMapper json, ObjectProvider<CreationRuntimeStreamService> runtime, GenerationConsentService consent) {
        this.properties = properties; this.clock = clock; this.jwt = jwt; this.json = json; this.runtime = runtime;
        this.consent = consent;
    }

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession session) throws Exception {
        if (clients.size() >= properties.maxConnections()) { session.close(RETRY); return; }
        session.setTextMessageSizeLimit(65_536);
        clients.put(session.getId(), new Client(new ConcurrentWebSocketSessionDecorator(session, 5_000, 1_048_576), clock.instant()));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Client client = clients.get(session.getId());
        if (client == null) return;
        try {
            JsonNode value = json.readTree(message.getPayload());
            String type = value.path("type").asText();
            if (client.claims == null) {
                if (!"authenticate".equals(type)) { close(client, CloseStatus.POLICY_VIOLATION); return; }
                AccessTokenClaims claims = jwt.parseAccessToken(value.path("accessToken").asText());
                if (!consent.getCurrentConsent(claims.userId()).consented()) { close(client, CloseStatus.POLICY_VIOLATION); return; }
                synchronized (this) {
                    if (clients.values().stream().filter(c -> c.claims != null && c.claims.userId() == claims.userId()).count()
                            >= properties.maxConnectionsPerUser()) { close(client, RETRY); return; }
                    client.claims = claims;
                }
                send(client, Map.of("type", "user.ready"));
                runtime.getObject().restore(claims.userId());
                return;
            }
            if (!client.claims.expiresAt().isAfter(clock.instant())) { close(client, new CloseStatus(4001, "Token expired")); return; }
            if ("sync".equals(type)) {
                JsonNode ids = value.path("creationIds");
                if (!ids.isArray() || ids.size() > 30) { close(client, CloseStatus.POLICY_VIOLATION); return; }
                for (JsonNode id : ids) runtime.getObject().watch(client.claims.userId(), Long.parseLong(id.asText()));
            } else if ("pong".equals(type)) client.lastPong = clock.instant();
            else close(client, CloseStatus.POLICY_VIOLATION);
        } catch (RuntimeException exception) {
            close(client, new CloseStatus(client.claims == null ? 4001 : 1008, "Authentication or message rejected"));
        }
    }

    public void publish(long userId, long eventId, PublicationStatusEvent event) { publishEvent(userId, "publication.updated", eventId, event); }
    public void publish(long userId, long eventId, InteractionNotificationCreatedEvent event) { publishEvent(userId, "interaction.notification.created", eventId, event); }

    private void publishEvent(long userId, String type, long eventId, Object value) {
        ObjectNode event = (ObjectNode) json.valueToTree(value);
        event.put("type", type); event.put("eventId", Long.toString(eventId));
        broadcast(userId, event);
    }

    public void broadcast(long userId, JsonNode event) {
        for (Client client : clients.values()) if (client.claims != null && client.claims.userId() == userId) send(client, event);
    }

    @Scheduled(fixedDelay = 1000)
    public void maintainConnections() {
        Instant now = clock.instant();
        for (Client client : clients.values()) {
            if (client.claims == null) { if (client.created.plusSeconds(5).isBefore(now)) close(client, CloseStatus.POLICY_VIOLATION); continue; }
            if (!client.claims.expiresAt().isAfter(now)) { close(client, new CloseStatus(4001, "Token expired")); continue; }
            if (client.lastPong.plus(properties.heartbeatInterval().multipliedBy(3)).isBefore(now)) { close(client, CloseStatus.SESSION_NOT_RELIABLE); continue; }
            if (!client.lastPing.plus(properties.heartbeatInterval()).isAfter(now)) {
                client.lastPing = now; send(client, Map.of("type", "ping"));
            }
        }
    }

    private void send(Client client, Object event) {
        try { client.session.sendMessage(new TextMessage(json.writeValueAsString(event))); }
        catch (Exception exception) { close(client, CloseStatus.SESSION_NOT_RELIABLE); }
    }
    private void close(Client client, CloseStatus status) {
        clients.remove(client.session.getId(), client);
        try { client.session.close(status); } catch (Exception ignored) { }
    }
    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { clients.remove(session.getId()); }
    @Override public void handleTransportError(WebSocketSession session, Throwable error) throws Exception { clients.remove(session.getId()); session.close(); }
    int activeConnectionCount() { return clients.size(); }

    private static final class Client {
        final WebSocketSession session;
        final Instant created;
        volatile AccessTokenClaims claims;
        volatile Instant lastPong;
        Instant lastPing;
        Client(WebSocketSession session, Instant now) { this.session = session; this.created = now; this.lastPong = now; this.lastPing = now; }
    }
}
