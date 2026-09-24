package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.ConversationMessage;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.mapper.ConversationMessageMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.AgentSessionContextMapper;
import com.superz.aivista.generation.message.AgentCompletionCommand;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AgentCompletionServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-09T03:00:00Z");
    private final CreationTaskMapper creations = mock(CreationTaskMapper.class);
    private final ConversationMessageMapper messages = mock(ConversationMessageMapper.class);
    private final GenerationSessionMapper sessions = mock(GenerationSessionMapper.class);
    private final AgentActivityService activities = mock(AgentActivityService.class);
    private final AgentSessionContextMapper contexts = mock(AgentSessionContextMapper.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AgentCompletionService service = new AgentCompletionService(creations, messages, sessions,
            Clock.fixed(NOW, ZoneOffset.UTC), activities, contexts, objectMapper);

    @Test
    void atomicallyWritesTheFinalAssistantMessageAndCreationOutcome() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(running());
        when(messages.selectLastSequenceNoForUpdate(101L)).thenReturn(3);
        when(creations.completeRunning(151L, 0L, "SUCCEEDED", null, NOW)).thenReturn(1);

        service.complete(command("SUCCEEDED", null, "  海报已生成。  "));
        ArgumentCaptor<ConversationMessage> message = ArgumentCaptor.forClass(ConversationMessage.class);
        verify(messages).insertSelective(message.capture());
        assertThat(message.getValue().getSequenceNo()).isEqualTo(4);
        assertThat(message.getValue().getContent()).isEqualTo("海报已生成。");
        verify(sessions).updateLastMessageAt(101L, NOW);
        verify(contexts).upsertCompleted(org.mockito.ArgumentMatchers.eq(101L),
                org.mockito.ArgumentMatchers.contains("\"schemaVersion\":1"),
                org.mockito.ArgumentMatchers.eq(151L),
                org.mockito.ArgumentMatchers.eq(1L),
                org.mockito.ArgumentMatchers.eq(NOW));
    }

    @Test
    void returnsTheAuthoritativeTerminalSnapshotForAnIdempotentReplay() {
        CreationTask completed = running();
        completed.setStatus("FAILED");
        completed.setFailureCode("MODEL_UNAVAILABLE");
        completed.setRevision(1L);
        when(creations.selectByIdForUpdate(151L)).thenReturn(completed);

        service.complete(command("FAILED", "MODEL_UNAVAILABLE", "暂时无法完成。"));
        verify(creations, never()).completeRunning(org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void doesNotReplaceTheLastSuccessfulContextWhenTheAgentFails() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(running());
        when(messages.selectLastSequenceNoForUpdate(101L)).thenReturn(3);
        when(creations.completeRunning(151L, 0L, "FAILED", "MODEL_UNAVAILABLE", NOW)).thenReturn(1);

        service.complete(command("FAILED", "MODEL_UNAVAILABLE", "暂时无法完成。"));

        verifyNoInteractions(contexts);
        verify(creations).completeRunning(151L, 0L, "FAILED", "MODEL_UNAVAILABLE", NOW);
    }

    @Test
    void rejectsAConflictingTerminalReplay() {
        CreationTask completed = running();
        completed.setStatus("SUCCEEDED");
        completed.setRevision(1L);
        when(creations.selectByIdForUpdate(151L)).thenReturn(completed);

        assertThatThrownBy(() -> service.complete(command("FAILED", "MODEL_UNAVAILABLE", null)))
                .isInstanceOf(IllegalStateException.class);
    }

    private static AgentCompletionCommand command(String outcome, String failure, String message) {
        var context = "SUCCEEDED".equals(outcome) ? context() : null;
        return new AgentCompletionCommand(2, "151", 0, outcome, failure, message, java.util.List.of(), context);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> context() {
        var context = new ObjectMapper().createObjectNode();
        context.put("schemaVersion", 1);
        context.putNull("compaction");
        context.putArray("messages");
        return new ObjectMapper().convertValue(context, Map.class);
    }

    private static CreationTask running() {
        CreationTask creation = new CreationTask();
        creation.setId(151L);
        creation.setSessionId(101L);
        creation.setMode("AGENT");
        creation.setStatus("RUNNING");
        creation.setRevision(0L);
        return creation;
    }
}
