package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GenerationTaskCancellationServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-30T02:00:00Z");

    @Test
    void cancelsQueuedTaskRefundsQuotaAndCreatesStatusEvent() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        UserGenerationDailyUsageMapper usageMapper = mock(UserGenerationDailyUsageMapper.class);
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationTask task = task("QUEUED", null);
        when(taskMapper.selectOwnedByIdForUpdate(7L, 301L)).thenReturn(task);
        when(usageMapper.refund(7L, java.time.LocalDate.of(2026, 7, 30), 2, NOW)).thenReturn(1);
        when(taskMapper.cancelActive(301L, "QUEUED", 3, NOW, NOW)).thenReturn(1);

        service(taskMapper, usageMapper, outboxMapper).cancel(7L, 301L);

        verify(usageMapper).refund(7L, java.time.LocalDate.of(2026, 7, 30), 2, NOW);
        verify(taskMapper).cancelActive(301L, "QUEUED", 3, NOW, NOW);
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxMapper).insertSelective(event.capture());
        assertThat(event.getValue().getEventType()).isEqualTo("GENERATION_TASK_STATUS_CHANGED");
        assertThat(event.getValue().getAggregateVersion()).isEqualTo(4L);
        assertThat(event.getValue().getPayloadJson())
                .isEqualTo("{\"status\":\"CANCELLED\",\"modelRetryCount\":0}");
    }

    @Test
    void cancelsStartedTaskWithoutRefund() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        UserGenerationDailyUsageMapper usageMapper = mock(UserGenerationDailyUsageMapper.class);
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationTask task = task("RUNNING", NOW.minusSeconds(1));
        when(taskMapper.selectOwnedByIdForUpdate(7L, 301L)).thenReturn(task);
        when(taskMapper.cancelActive(301L, "RUNNING", 3, null, NOW)).thenReturn(1);

        service(taskMapper, usageMapper, outboxMapper).cancel(7L, 301L);

        verify(usageMapper, never()).refund(anyLong(), any(), anyInt(), any());
        verify(taskMapper).cancelActive(301L, "RUNNING", 3, null, NOW);
    }

    @Test
    void repeatsCancelledTaskWithoutChangingItAndRejectsOtherTerminals() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        UserGenerationDailyUsageMapper usageMapper = mock(UserGenerationDailyUsageMapper.class);
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationTask cancelled = task("CANCELLED", null);
        when(taskMapper.selectOwnedByIdForUpdate(7L, 301L)).thenReturn(cancelled);

        service(taskMapper, usageMapper, outboxMapper).cancel(7L, 301L);

        verify(taskMapper, never()).cancelActive(anyLong(), any(), anyInt(), any(), any());
        GenerationTask succeeded = task("SUCCEEDED", null);
        when(taskMapper.selectOwnedByIdForUpdate(7L, 301L)).thenReturn(succeeded);
        assertThatThrownBy(() -> service(taskMapper, usageMapper, outboxMapper).cancel(7L, 301L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.TASK_ALREADY_FINISHED));
    }

    private static GenerationTaskCancellationService service(GenerationTaskMapper taskMapper,
            UserGenerationDailyUsageMapper usageMapper, OutboxEventMapper outboxMapper) {
        return new GenerationTaskCancellationService(taskMapper, usageMapper, outboxMapper,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationTask task(String status, Instant providerCallStartedAt) {
        GenerationTask task = new GenerationTask();
        task.setId(301L);
        task.setUserId(7L);
        task.setStatus(status);
        task.setTaskVersion(3);
        task.setRequestedImageCount(2);
        task.setCreatedAt(Instant.parse("2026-07-30T01:00:00Z"));
        task.setProviderCallStartedAt(providerCallStartedAt);
        return task;
    }
}
