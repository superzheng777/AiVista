package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import com.superz.aivista.generation.message.TaskExecuteMessage;
import java.net.ConnectException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class GenerationTaskExecutionServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-29T02:00:00Z");

    @Test
    void persistsSnapshotTransferCommandAndTransferringStatusBeforeAcknowledging() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationBailianClient bailianClient = mock(GenerationBailianClient.class);
        GenerationProviderCallGate callGate = permitGate();
        GenerationTask queued = task("QUEUED", 0);
        GenerationTask running = task("RUNNING", 1);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queued, running);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(taskMapper.markProviderCallStarted(301L, NOW)).thenReturn(1);
        when(taskMapper.markReadyForTransfer(301L, 1, "request-1", "snapshot", NOW)).thenReturn(1);
        when(bailianClient.generate(queued)).thenReturn(new GenerationBailianClient.ProviderResult(
                "request-1", List.of("https://provider.example/image.png"), 1, 2048, 2048, "snapshot"));

        assertThat(service(taskMapper, outboxMapper, bailianClient, callGate)
                .execute(new TaskExecuteMessage(11L, 301L, 0))).isTrue();

        verify(taskMapper).markReadyForTransfer(301L, 1, "request-1", "snapshot", NOW);
        ArgumentCaptor<OutboxEvent> events = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxMapper, org.mockito.Mockito.times(3)).insertSelective(events.capture());
        assertThat(events.getAllValues()).extracting(OutboxEvent::getEventType)
                .containsExactly("GENERATION_TASK_STATUS_CHANGED", "GENERATION_IMAGE_TRANSFER",
                        "GENERATION_TASK_STATUS_CHANGED");
        assertThat(events.getAllValues().get(1).getAggregateVersion()).isEqualTo(2L);
        assertThat(events.getAllValues().get(2).getPayloadJson())
                .isEqualTo("{\"status\":\"TRANSFERRING\",\"modelRetryCount\":0}");
    }

    @Test
    void acknowledgesStaleGenerationMessageAfterTaskEnteredTransferStage() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationBailianClient client = mock(GenerationBailianClient.class);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(task("TRANSFERRING", 2));

        assertThat(service(taskMapper, mock(OutboxEventMapper.class), client, mock(GenerationProviderCallGate.class))
                .execute(new TaskExecuteMessage(11L, 301L, 1))).isTrue();

        verify(client, never()).generate(any());
    }

    @Test
    void doesNotCallProviderWhenCancellationWinsBeforeCallStarts() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationBailianClient client = mock(GenerationBailianClient.class);
        GenerationProviderCallGate callGate = permitGate();
        GenerationTask queued = task("QUEUED", 0);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queued);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(taskMapper.markProviderCallStarted(301L, NOW)).thenReturn(0);

        assertThat(service(taskMapper, mock(OutboxEventMapper.class), client, callGate)
                .execute(new TaskExecuteMessage(11L, 301L, 0))).isTrue();

        verify(client, never()).generate(any());
    }

    @Test
    void requeuesMessageWhenInterruptedWhileWaitingForProviderPermit() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationProviderCallGate callGate = mock(GenerationProviderCallGate.class);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(task("QUEUED", 0));
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(callGate.acquire()).thenThrow(new InterruptedException("stopping"));

        assertThat(service(taskMapper, mock(OutboxEventMapper.class), mock(GenerationBailianClient.class), callGate)
                .execute(new TaskExecuteMessage(11L, 301L, 0))).isFalse();
        assertThat(Thread.interrupted()).isTrue();
        verify(taskMapper, never()).markProviderCallStarted(anyLong(), any());
    }

    @Test
    void requeuesRetryableProviderFailure() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationBailianClient client = mock(GenerationBailianClient.class);
        GenerationTask queued = task("QUEUED", 0);
        GenerationTask running = task("RUNNING", 1);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queued, running);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(taskMapper.markProviderCallStarted(301L, NOW)).thenReturn(1);
        when(client.generate(queued)).thenThrow(new BailianConnectionException(new ConnectException("refused")));
        when(taskMapper.requeueRunningForRetry(301L, 1, NOW)).thenReturn(1);

        assertThat(service(taskMapper, outboxMapper, client, permitGate())
                .execute(new TaskExecuteMessage(11L, 301L, 0))).isTrue();

        verify(taskMapper).requeueRunningForRetry(301L, 1, NOW);
    }

    private static GenerationTaskExecutionService service(GenerationTaskMapper taskMapper,
            OutboxEventMapper outboxMapper, GenerationBailianClient client, GenerationProviderCallGate gate) {
        return new GenerationTaskExecutionService(taskMapper, outboxMapper,
                mock(UserGenerationDailyUsageMapper.class), client, gate, transactionManager(),
                new GenerationBailianProperties("https://example.com", "key", java.time.Duration.ofSeconds(5),
                        java.time.Duration.ofSeconds(330), 25, 2, 3),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationProviderCallGate permitGate() throws InterruptedException {
        GenerationProviderCallGate gate = mock(GenerationProviderCallGate.class);
        when(gate.acquire()).thenReturn(mock(GenerationProviderCallGate.Permit.class));
        return gate;
    }

    private static PlatformTransactionManager transactionManager() {
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        return manager;
    }

    private static GenerationTask task(String status, int version) {
        GenerationTask task = new GenerationTask();
        task.setId(301L);
        task.setUserId(7L);
        task.setStatus(status);
        task.setTaskVersion(version);
        task.setAttemptCount(0);
        task.setModel("bailian/qwen-image-2.0");
        task.setFinalPrompt("one future city");
        task.setWidth(2048);
        task.setHeight(2048);
        task.setPromptExtend(true);
        task.setRequestedImageCount(1);
        task.setCreatedAt(NOW);
        return task;
    }
}
