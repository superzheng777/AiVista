package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.event.AgentRealtimeEvent;
import com.superz.aivista.generation.event.AgentRealtimeInboundEvent;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.dto.CreationFormResponse;
import com.superz.aivista.generation.dto.ResolveCreationFormResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class AgentRealtimeProjectionServiceTests {
    private final CreationTaskMapper creations = Mockito.mock(CreationTaskMapper.class);
    private final GenerationSseConnectionService connections = Mockito.mock(GenerationSseConnectionService.class);
    private final AgentRealtimeProjectionService service = new AgentRealtimeProjectionService(creations, connections);

    @Test
    void routesOnlyJavaVerifiedAgentEventsAndAssignsStableStreamSequence() {
        when(creations.selectSnapshotById(31L)).thenReturn(creation("AGENT", "RUNNING", 4L));

        assertThat(service.publish(event("TEXT_STARTED", Map.of("contentIndex", 0)))).isTrue();
        assertThat(service.publish(event("TEXT_DELTA", Map.of("contentIndex", 0, "delta", "构图")))).isTrue();

        ArgumentCaptor<AgentRealtimeEvent> events = ArgumentCaptor.forClass(AgentRealtimeEvent.class);
        verify(connections, Mockito.times(2)).publishAgent(Mockito.eq(7L), anyLong(), events.capture());
        assertThat(events.getAllValues()).extracting(AgentRealtimeEvent::sequence).containsExactly(1L, 2L);
        assertThat(events.getAllValues()).extracting(AgentRealtimeEvent::streamId).doesNotContainNull()
                .containsOnly(events.getAllValues().getFirst().streamId());
        assertThat(events.getAllValues().getFirst().creationId()).isEqualTo("31");
        assertThat(events.getAllValues().getFirst().sessionId()).isEqualTo("9");
    }

    @Test
    void rejectsUnknownTypesAndStaleOrNonAgentCreations() {
        when(creations.selectSnapshotById(31L)).thenReturn(creation("AGENT", "RUNNING", 3L));
        assertThat(service.publish(event("PROVIDER_DEBUG", Map.of()))).isFalse();
        assertThat(service.publish(event("TEXT_DELTA", Map.of("delta", "old")))).isFalse();
        verify(connections, never()).publishAgent(anyLong(), anyLong(), Mockito.any());
    }

    @Test
    void replaysOneSafeSnapshotForANewBrowserConnection() {
        when(creations.selectSnapshotById(31L)).thenReturn(creation("AGENT", "RUNNING", 4L));
        service.publish(event("RUN_STARTED", Map.of()));
        service.publish(event("TEXT_DELTA", Map.of("contentIndex", 0, "delta", "正在构图")));
        service.publish(event("TOOL_STARTED", Map.of("toolCallId", "call-1", "toolName", "text_to_image")));

        service.replay(7L);

        ArgumentCaptor<AgentRealtimeEvent> events = ArgumentCaptor.forClass(AgentRealtimeEvent.class);
        verify(connections, Mockito.times(4)).publishAgent(Mockito.eq(7L), anyLong(), events.capture());
        AgentRealtimeEvent snapshot = events.getAllValues().getLast();
        assertThat(snapshot.eventType()).isEqualTo("RUN_SNAPSHOT");
        assertThat(snapshot.sequence()).isEqualTo(3L);
        assertThat(snapshot.payload()).containsEntry("text", "正在构图");
        assertThat((java.util.List<?>) snapshot.payload().get("tools")).hasSize(1);
    }

    @Test
    void publishesTheTerminalEventFromCommittedJavaStateAndClosesTheStream() {
        when(creations.selectSnapshotById(31L)).thenReturn(creation("AGENT", "RUNNING", 4L));
        service.publish(event("RUN_STARTED", Map.of()));
        CreationTask completed = creation("AGENT", "SUCCEEDED", 5L);
        when(creations.selectSnapshotById(31L)).thenReturn(completed);

        service.publishTerminal(31L, 4L);

        ArgumentCaptor<AgentRealtimeEvent> events = ArgumentCaptor.forClass(AgentRealtimeEvent.class);
        verify(connections, Mockito.times(2)).publishAgent(Mockito.eq(7L), anyLong(), events.capture());
        assertThat(events.getAllValues().getLast().eventType()).isEqualTo("RUN_FINISHED");
        assertThat(events.getAllValues().getLast().sequence()).isEqualTo(2L);
        assertThat(events.getAllValues().getLast().revision()).isEqualTo(5L);
    }

    @Test
    void emitsTheJavaCommittedTerminalEventOnTheExistingStream() {
        CreationTask running = creation("AGENT", "RUNNING", 4L);
        when(creations.selectSnapshotById(31L)).thenReturn(running);
        service.publish(event("RUN_STARTED", Map.of()));
        CreationTask completed = creation("AGENT", "SUCCEEDED", 5L);
        when(creations.selectSnapshotById(31L)).thenReturn(completed);

        service.publishTerminal(31L, 4L);

        ArgumentCaptor<AgentRealtimeEvent> events = ArgumentCaptor.forClass(AgentRealtimeEvent.class);
        verify(connections, Mockito.times(2)).publishAgent(Mockito.eq(7L), anyLong(), events.capture());
        assertThat(events.getAllValues().getLast().eventType()).isEqualTo("RUN_FINISHED");
        assertThat(events.getAllValues().getLast().sequence()).isEqualTo(2L);
        assertThat(events.getAllValues().getLast().revision()).isEqualTo(5L);
    }

    @Test
    void publishesCancellationAsADistinctTerminalEvent() {
        when(creations.selectSnapshotById(31L)).thenReturn(creation("AGENT", "CANCELLED", 5L));

        service.publishTerminal(31L, 4L);

        ArgumentCaptor<AgentRealtimeEvent> event = ArgumentCaptor.forClass(AgentRealtimeEvent.class);
        verify(connections).publishAgent(Mockito.eq(7L), anyLong(), event.capture());
        assertThat(event.getValue().eventType()).isEqualTo("RUN_CANCELLED");
        assertThat(event.getValue().payload()).containsEntry("status", "CANCELLED");
    }

    @Test
    void publishesTheFullCommittedFormWithoutASecondRestRead() {
        when(creations.selectSnapshotById(31L)).thenReturn(creation("AGENT", "WAITING_INPUT", 5L));
        var definition = new ObjectMapper().createObjectNode();
        definition.put("schemaVersion", 2).put("title", "确认需求");
        definition.putArray("fields").add(new ObjectMapper().createObjectNode()
                .put("id", "subject").put("type", "TEXT").put("label", "主题")
                .put("required", true).put("value", ""));
        @SuppressWarnings("unchecked")
        var definitionMap = (java.util.Map<String, Object>) new ObjectMapper().convertValue(
                definition, java.util.Map.class);
        var form = new CreationFormResponse("701", "call-form-1", "PENDING", definitionMap,
                Instant.parse("2026-09-20T01:00:00Z"), null);

        service.publishFormRequested(31L, 5L, form);

        ArgumentCaptor<AgentRealtimeEvent> event = ArgumentCaptor.forClass(AgentRealtimeEvent.class);
        verify(connections).publishAgent(Mockito.eq(7L), anyLong(), event.capture());
        assertThat(event.getValue().eventType()).isEqualTo("FORM_REQUESTED");
        assertThat(event.getValue().revision()).isEqualTo(5L);
        assertThat(event.getValue().payload()).containsEntry("form", form);
    }

    @Test
    void publishesTheFilledSubmittedFormAfterResolution() {
        when(creations.selectSnapshotById(31L)).thenReturn(creation("AGENT", "RUNNING", 6L));
        var definition = new ObjectMapper().createObjectNode();
        definition.put("schemaVersion", 2).put("title", "确认需求");
        definition.putArray("fields").add(new ObjectMapper().createObjectNode()
                .put("id", "subject").put("type", "TEXT").put("label", "主题")
                .put("required", true).put("value", "雾灯岛"));
        @SuppressWarnings("unchecked")
        var definitionMap = (java.util.Map<String, Object>) new ObjectMapper().convertValue(
                definition, java.util.Map.class);
        var form = new CreationFormResponse("701", "call-form-1", "SUBMITTED", definitionMap,
                Instant.parse("2026-09-20T01:00:00Z"), Instant.parse("2026-09-20T01:01:00Z"));

        service.publishFormResolved(31L, new ResolveCreationFormResponse("31", 6L, form));

        ArgumentCaptor<AgentRealtimeEvent> event = ArgumentCaptor.forClass(AgentRealtimeEvent.class);
        verify(connections).publishAgent(Mockito.eq(7L), anyLong(), event.capture());
        assertThat(event.getValue().eventType()).isEqualTo("FORM_RESOLVED");
        assertThat(event.getValue().revision()).isEqualTo(6L);
        assertThat(event.getValue().payload()).containsEntry("form", form);
        var fields = (java.util.List<?>) form.form().get("fields");
        assertThat(((java.util.Map<?, ?>) fields.getFirst()).get("value")).isEqualTo("雾灯岛");
    }

    private AgentRealtimeInboundEvent event(String type, Map<String, Object> payload) {
        return new AgentRealtimeInboundEvent(31L, 4L, type, payload);
    }

    private static CreationTask creation(String mode, String status, long revision) {
        CreationTask creation = new CreationTask();
        creation.setId(31L);
        creation.setUserId(7L);
        creation.setSessionId(9L);
        creation.setMode(mode);
        creation.setStatus(status);
        creation.setRevision(revision);
        return creation;
    }
}
