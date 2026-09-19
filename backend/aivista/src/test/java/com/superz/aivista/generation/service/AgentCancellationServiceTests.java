package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class AgentCancellationServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-10T01:00:00Z");
    private final CreationTaskMapper creations = mock(CreationTaskMapper.class);
    private final AgentCancellationService service = new AgentCancellationService(
            creations, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void atomicallyCancelsTheOwnedRunningAgent() {
        CreationTask creation = creation(7L, "RUNNING", 4L);
        when(creations.selectByIdForUpdate(31L)).thenReturn(creation);
        when(creations.completeRunning(31L, 4L, "CANCELLED", null, NOW)).thenReturn(1);

        var result = service.cancel(7L, 31L);
        var response = result.response();

        assertThat(response.status()).isEqualTo("CANCELLED");
        assertThat(response.revision()).isEqualTo(5L);
        assertThat(response.completedAt()).isEqualTo(NOW);
        assertThat(result.transitioned()).isTrue();
        assertThat(result.executionRevision()).isEqualTo(4L);
        verify(creations).completeRunning(31L, 4L, "CANCELLED", null, NOW);
    }

    @Test
    void repeatsCancellationIdempotently() {
        CreationTask creation = creation(7L, "CANCELLED", 5L);
        creation.setCompletedAt(NOW);
        when(creations.selectByIdForUpdate(31L)).thenReturn(creation);

        var result = service.cancel(7L, 31L);
        assertThat(result.response().revision()).isEqualTo(5L);
        assertThat(result.transitioned()).isFalse();
        verify(creations, never()).completeRunning(31L, 5L, "CANCELLED", null, NOW);
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
}
