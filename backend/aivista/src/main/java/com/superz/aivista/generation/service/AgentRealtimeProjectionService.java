package com.superz.aivista.generation.service;

import com.superz.aivista.generation.dto.CreationFormResponse;
import com.superz.aivista.generation.dto.ResolveCreationFormResponse;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.event.AgentRealtimeEvent;
import com.superz.aivista.generation.event.AgentRealtimeInboundEvent;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Service;

/** Validates trusted-runtime events and adds the Java-owned browser routing envelope. */
@Service
public class AgentRealtimeProjectionService {
    private static final Set<String> ALLOWED_TYPES = Set.of(
            "RUN_STARTED", "TEXT_STARTED", "TEXT_DELTA", "TEXT_FINISHED", "NARRATION",
            "SKILL_SELECTED", "TOOL_STARTED", "TOOL_PROGRESS", "TOOL_FINISHED");

    private final CreationTaskMapper creationTasks;
    private final GenerationSseConnectionService connections;
    private final Map<StreamKey, StreamState> streams = new ConcurrentHashMap<>();
    private final AtomicLong eventIds = new AtomicLong();

    public AgentRealtimeProjectionService(CreationTaskMapper creationTasks,
            GenerationSseConnectionService connections) {
        this.creationTasks = creationTasks;
        this.connections = connections;
    }

    public boolean publish(AgentRealtimeInboundEvent inbound) {
        if (!ALLOWED_TYPES.contains(inbound.eventType()) || inbound.payload() == null) return false;
        CreationTask creation = creationTasks.selectSnapshotById(inbound.creationId());
        if (creation == null || !"AGENT".equals(creation.getMode()) || !"RUNNING".equals(creation.getStatus())
                || creation.getRevision() == null || creation.getRevision() != inbound.revision()) {
            return false;
        }
        StreamKey key = new StreamKey(inbound.creationId(), inbound.revision());
        StreamState stream = streams.computeIfAbsent(key,
                ignored -> new StreamState(creation.getUserId(), creation.getSessionId(),
                        inbound.creationId(), inbound.revision(), UUID.randomUUID().toString()));
        long sequence = stream.accept(inbound.eventType(), inbound.payload());
        AgentRealtimeEvent event = new AgentRealtimeEvent(String.valueOf(inbound.creationId()),
                String.valueOf(creation.getSessionId()),
                inbound.revision(), stream.streamId, sequence, inbound.eventType(),
                Map.copyOf(inbound.payload()));
        connections.publishAgent(creation.getUserId(), eventIds.incrementAndGet(), event);
        return true;
    }

    /** Replays one safe in-memory projection after a browser SSE connection is established. */
    public void replay(long userId) {
        for (StreamState stream : new ArrayList<>(streams.values())) {
            AgentRealtimeEvent snapshot = stream.snapshot(userId);
            if (snapshot != null) connections.publishAgent(userId, eventIds.incrementAndGet(), snapshot);
        }
    }

    /** Called only after the Agent completion transaction has returned successfully. */
    public void publishTerminal(long creationTaskId, long executionRevision) {
        CreationTask creation = creationTasks.selectSnapshotById(creationTaskId);
        if (creation == null || !"AGENT".equals(creation.getMode()) || creation.getRevision() == null
                || creation.getRevision() != executionRevision + 1
                || !("SUCCEEDED".equals(creation.getStatus()) || "FAILED".equals(creation.getStatus())
                    || "CANCELLED".equals(creation.getStatus()))) return;
        StreamKey key = new StreamKey(creationTaskId, executionRevision);
        StreamState stream = streams.computeIfAbsent(key,
                ignored -> new StreamState(creation.getUserId(), creation.getSessionId(), creationTaskId,
                        executionRevision, UUID.randomUUID().toString()));
        String eventType = switch (creation.getStatus()) {
            case "SUCCEEDED" -> "RUN_FINISHED";
            case "CANCELLED" -> "RUN_CANCELLED";
            default -> "RUN_FAILED";
        };
        AgentRealtimeEvent event = new AgentRealtimeEvent(String.valueOf(creationTaskId),
                String.valueOf(creation.getSessionId()),
                creation.getRevision(), stream.streamId, stream.nextSequence(), eventType,
                Map.of("status", creation.getStatus()));
        connections.publishAgent(creation.getUserId(), eventIds.incrementAndGet(), event);
        streams.remove(key, stream);
    }

    /** Publishes a committed form snapshot; unlike transient Pi events this is directly renderable. */
    public void publishFormRequested(long creationTaskId, long revision, CreationFormResponse form) {
        CreationTask creation = creationTasks.selectSnapshotById(creationTaskId);
        if (!matches(creation, revision, "WAITING_INPUT")) return;
        streams.remove(new StreamKey(creationTaskId, revision - 1));
        publishForm(creation, revision, "FORM_REQUESTED", form, 1);
    }

    /** Publishes the persisted submitted/skipped form before the resumed Pi segment starts. */
    public void publishFormResolved(long creationTaskId, ResolveCreationFormResponse response) {
        CreationTask creation = creationTasks.selectSnapshotById(creationTaskId);
        if (!matches(creation, response.revision(), "RUNNING")) return;
        publishForm(creation, response.revision(), "FORM_RESOLVED", response.form(), 2);
    }

    private void publishForm(CreationTask creation, long revision, String eventType,
            CreationFormResponse form, long sequence) {
        AgentRealtimeEvent event = new AgentRealtimeEvent(Long.toString(creation.getId()),
                Long.toString(creation.getSessionId()), revision, "form-" + form.formId(), sequence,
                eventType, Map.of("form", form));
        connections.publishAgent(creation.getUserId(), eventIds.incrementAndGet(), event);
    }

    private static boolean matches(CreationTask creation, long revision, String status) {
        return creation != null && "AGENT".equals(creation.getMode()) && status.equals(creation.getStatus())
                && creation.getRevision() != null && creation.getRevision() == revision;
    }

    private record StreamKey(long creationTaskId, long revision) {
    }

    private static final class StreamState {
        private final long userId;
        private final long sessionId;
        private final long creationId;
        private final long revision;
        private final String streamId;
        private final AtomicLong sequence = new AtomicLong();
        private final StringBuilder text = new StringBuilder();
        private final List<String> skills = new ArrayList<>();
        private final Map<String, Map<String, Object>> tools = new LinkedHashMap<>();

        private StreamState(long userId, long sessionId, long creationId, long revision, String streamId) {
            this.userId = userId;
            this.sessionId = sessionId;
            this.creationId = creationId;
            this.revision = revision;
            this.streamId = streamId;
        }

        synchronized long accept(String eventType, Map<String, Object> payload) {
            switch (eventType) {
                case "RUN_STARTED" -> {
                    text.setLength(0);
                    skills.clear();
                    tools.clear();
                }
                case "TEXT_DELTA" -> append(payload.get("delta"));
                case "NARRATION" -> append(payload.get("text"));
                case "SKILL_SELECTED" -> addSkill(payload.get("skillName"));
                case "TOOL_STARTED" -> putTool(payload, "RUNNING");
                case "TOOL_FINISHED" -> putTool(payload,
                        "FAILED".equals(payload.get("outcome")) ? "FAILED" : "SUCCEEDED");
                default -> { }
            }
            return nextSequence();
        }

        long nextSequence() {
            return sequence.incrementAndGet();
        }

        synchronized AgentRealtimeEvent snapshot(long requestedUserId) {
            if (userId != requestedUserId || sequence.get() == 0) return null;
            return new AgentRealtimeEvent(Long.toString(creationId), Long.toString(sessionId), revision,
                    streamId, sequence.get(), "RUN_SNAPSHOT", Map.of(
                            "text", text.toString(),
                            "skills", List.copyOf(skills),
                            "tools", List.copyOf(tools.values())));
        }

        private void append(Object value) {
            if (value instanceof String content) text.append(content);
        }

        private void addSkill(Object value) {
            if (value instanceof String skill && !skills.contains(skill)) skills.add(skill);
        }

        private void putTool(Map<String, Object> payload, String state) {
            Object callId = payload.get("toolCallId");
            Object name = payload.get("toolName");
            if (callId instanceof String id && name instanceof String toolName) {
                tools.put(id, Map.of("toolCallId", id, "toolName", toolName, "state", state));
            }
        }
    }
}
