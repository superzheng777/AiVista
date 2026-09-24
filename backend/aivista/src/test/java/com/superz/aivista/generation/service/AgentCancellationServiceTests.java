package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.AgentSessionContext;
import com.superz.aivista.generation.entity.CreationForm;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.mapper.AgentSessionContextMapper;
import com.superz.aivista.generation.mapper.CreationFormMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class AgentCancellationServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-10T01:00:00Z");
    private final CreationTaskMapper creations = mock(CreationTaskMapper.class);
    private final CreationFormMapper forms = mock(CreationFormMapper.class);
    private final AgentSessionContextMapper contexts = mock(AgentSessionContextMapper.class);
    private final AgentCancellationService service = new AgentCancellationService(
            creations, forms, contexts, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void atomicallyCancelsTheOwnedRunningAgent() {
        CreationTask creation = creation(7L, "RUNNING", 4L);
        when(creations.selectByIdForUpdate(31L)).thenReturn(creation);
        when(creations.cancelActive(31L, 4L, NOW)).thenReturn(1);

        var result = service.cancel(7L, 31L);
        var response = result.response();

        assertThat(response.status()).isEqualTo("CANCELLED");
        assertThat(response.revision()).isEqualTo(5L);
        assertThat(response.completedAt()).isEqualTo(NOW);
        assertThat(result.transitioned()).isTrue();
        assertThat(result.executionRevision()).isEqualTo(4L);
        verify(creations).cancelActive(31L, 4L, NOW);
    }

    @Test
    void cancelsAnAgentWaitingForFormInput() {
        CreationTask creation = creation(7L, "WAITING_INPUT", 5L);
        AgentSessionContext context = context(5L, "PENDING");
        CreationForm form = new CreationForm();
        form.setId(701L);
        form.setStatus("PENDING");
        when(creations.selectByIdForUpdate(31L)).thenReturn(creation);
        when(contexts.selectBySessionId(9L)).thenReturn(context);
        when(forms.selectByToolCallForUpdate(31L, "call-form-1")).thenReturn(form);
        when(forms.cancelPending(701L, NOW)).thenReturn(1);
        when(contexts.transitionPending(9L, 31L, 5L, 6L, "call-form-1",
                "PENDING", "CANCELLED", NOW)).thenReturn(1);
        when(creations.cancelActive(31L, 5L, NOW)).thenReturn(1);

        var result = service.cancel(7L, 31L);

        assertThat(result.response().status()).isEqualTo("CANCELLED");
        assertThat(result.response().revision()).isEqualTo(6L);
        assertThat(result.executionRevision()).isEqualTo(5L);
        verify(forms).cancelPending(701L, NOW);
        verify(contexts).transitionPending(9L, 31L, 5L, 6L, "call-form-1",
                "PENDING", "CANCELLED", NOW);
        verify(creations).cancelActive(31L, 5L, NOW);
    }

    @Test
    void marksResolvedPendingMetadataCancelledWhenTheResumedSegmentIsCancelled() {
        CreationTask creation = creation(7L, "RUNNING", 6L);
        when(creations.selectByIdForUpdate(31L)).thenReturn(creation);
        when(contexts.selectBySessionId(9L)).thenReturn(context(6L, "SUBMITTED"));
        when(contexts.transitionPending(9L, 31L, 6L, 7L, "call-form-1",
                "SUBMITTED", "CANCELLED", NOW)).thenReturn(1);
        when(creations.cancelActive(31L, 6L, NOW)).thenReturn(1);

        var result = service.cancel(7L, 31L);

        assertThat(result.response().revision()).isEqualTo(7L);
        verify(contexts).transitionPending(9L, 31L, 6L, 7L, "call-form-1",
                "SUBMITTED", "CANCELLED", NOW);
    }

    @Test
    void repeatsCancellationIdempotently() {
        CreationTask creation = creation(7L, "CANCELLED", 5L);
        creation.setCompletedAt(NOW);
        when(creations.selectByIdForUpdate(31L)).thenReturn(creation);

        var result = service.cancel(7L, 31L);
        assertThat(result.response().revision()).isEqualTo(5L);
        assertThat(result.transitioned()).isFalse();
        verify(creations, never()).cancelActive(31L, 5L, NOW);
    }

    @Test
    void hidesAnotherUsersCreation() {
        when(creations.selectByIdForUpdate(31L)).thenReturn(creation(8L, "RUNNING", 4L));

        assertThatThrownBy(() -> service.cancel(7L, 31L))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));
    }

    @Test
    void rejectsCancellingAnAlreadyCompletedAgent() {
        when(creations.selectByIdForUpdate(31L)).thenReturn(creation(7L, "SUCCEEDED", 5L));

        assertThatThrownBy(() -> service.cancel(7L, 31L))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.AGENT_CREATION_NOT_RUNNING));
    }

    private static CreationTask creation(long userId, String status, long revision) {
        CreationTask creation = new CreationTask();
        creation.setId(31L);
        creation.setUserId(userId);
        creation.setSessionId(9L);
        creation.setMode("AGENT");
        creation.setStatus(status);
        creation.setRevision(revision);
        return creation;
    }

    private static AgentSessionContext context(long revision, String status) {
        AgentSessionContext context = new AgentSessionContext();
        context.setSessionId(9L);
        context.setSnapshotCreationTaskId(31L);
        context.setSnapshotRevision(revision);
        context.setPendingToolCallId("call-form-1");
        context.setPendingInputStatus(status);
        return context;
    }
}
