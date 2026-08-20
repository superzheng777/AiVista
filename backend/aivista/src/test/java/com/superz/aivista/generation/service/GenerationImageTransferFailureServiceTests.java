package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GenerationImageTransferFailureServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-20T12:00:00Z");

    @Test
    void waitingTimeoutFailsOnlyMatchingUnclaimedTransferVersionWithoutRefund() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationTask task = new GenerationTask();
        task.setId(301L);
        task.setStatus("TRANSFERRING");
        task.setTaskVersion(2);
        task.setAttemptCount(0);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(task);
        when(taskMapper.failTransferring(301L, 2, "IMAGE_TRANSFER_FAILED", NOW)).thenReturn(1);

        boolean failed = new GenerationImageTransferFailureService(taskMapper, outboxMapper)
                .failWaitingTimeout(301L, 2, NOW);

        assertThat(failed).isTrue();
        verify(taskMapper).failTransferring(301L, 2, "IMAGE_TRANSFER_FAILED", NOW);
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxMapper).insertSelective(event.capture());
        assertThat(event.getValue().getPayloadJson())
                .isEqualTo("{\"status\":\"FAILED\",\"modelRetryCount\":0}");
    }
}
