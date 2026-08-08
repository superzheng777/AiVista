package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import com.superz.aivista.generation.message.TaskExecuteMessage;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.net.ConnectException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class GenerationTaskExecutionServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-29T02:00:00Z");

    @Test
    void executesOneImageTaskThenPersistsImageTerminalStateAndStatusEvent() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OutboxEventMapper outboxEventMapper = mock(OutboxEventMapper.class);
        UserGenerationDailyUsageMapper dailyUsageMapper = mock(UserGenerationDailyUsageMapper.class);
        GenerationBailianClient bailianClient = mock(GenerationBailianClient.class);
        GenerationProviderCallGate providerCallGate = mock(GenerationProviderCallGate.class);
        when(providerCallGate.acquire()).thenReturn(mock(GenerationProviderCallGate.Permit.class));
        GenerationImageTransferService imageTransferService = mock(GenerationImageTransferService.class);
        PlatformTransactionManager transactionManager = transactionManager();
        GenerationTask queuedTask = task("QUEUED", 0);
        GenerationTask runningTask = task("RUNNING", 1);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queuedTask, runningTask);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(taskMapper.markProviderCallStarted(301L, NOW)).thenReturn(1);
        when(taskMapper.saveProviderResult(301L, "request-1", "snapshot", NOW)).thenReturn(1);
        GenerationBailianClient.ProviderResult providerResult = new GenerationBailianClient.ProviderResult(
                "request-1", List.of("https://provider.example/image.png"), 1, 2048, 2048, "snapshot");
        when(bailianClient.generate(queuedTask)).thenReturn(providerResult);
        when(imageTransferService.transfer(queuedTask, providerResult.imageUrls())).thenReturn(List.of(
                new GenerationImageTransferService.TransferredImage(0,
                        "users/7/tasks/301/0.png", 1024, 2048, 2048)));
        when(taskMapper.completeRunning(301L, "SUCCEEDED", 1, null, NOW)).thenReturn(1);

        GenerationTaskExecutionService service = new GenerationTaskExecutionService(taskMapper, imageMapper,
                outboxEventMapper, dailyUsageMapper, bailianClient, providerCallGate, imageTransferService,
                transactionManager, bailianProperties(), Clock.fixed(NOW, ZoneOffset.UTC));

        boolean canAcknowledge = service.execute(new TaskExecuteMessage(11L, 301L, 0));

        assertThat(canAcknowledge).isTrue();
        InOrder callOrder = inOrder(providerCallGate, taskMapper, bailianClient);
        callOrder.verify(providerCallGate).acquire();
        callOrder.verify(taskMapper).markProviderCallStarted(301L, NOW);
        callOrder.verify(bailianClient).generate(queuedTask);
        verify(taskMapper).markProviderCallStarted(301L, NOW);
        verify(taskMapper).saveProviderResult(301L, "request-1", "snapshot", NOW);
        verify(taskMapper).completeRunning(301L, "SUCCEEDED", 1, null, NOW);
        ArgumentCaptor<GenerationImage> image = ArgumentCaptor.forClass(GenerationImage.class);
        verify(imageMapper).insertSelective(image.capture());
        assertThat(image.getValue().getTaskId()).isEqualTo(301L);
        assertThat(image.getValue().getObjectKey()).isEqualTo("users/7/tasks/301/0.png");
        assertThat(image.getValue().getWidth()).isEqualTo(2048);
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventMapper, org.mockito.Mockito.times(2)).insertSelective(event.capture());
        assertThat(event.getAllValues()).extracting(OutboxEvent::getPayloadJson)
                .containsExactly("{\"status\":\"RUNNING\",\"modelRetryCount\":0}",
                        "{\"status\":\"SUCCEEDED\",\"modelRetryCount\":0}");
        assertThat(event.getAllValues()).extracting(OutboxEvent::getAggregateVersion)
                .containsExactly(1L, 2L);
    }

    @Test
    void doesNotCallProviderWhenCancellationWinsBeforeCallStarts() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationBailianClient bailianClient = mock(GenerationBailianClient.class);
        GenerationProviderCallGate providerCallGate = mock(GenerationProviderCallGate.class);
        when(providerCallGate.acquire()).thenReturn(mock(GenerationProviderCallGate.Permit.class));
        GenerationTask queuedTask = task("QUEUED", 0);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queuedTask);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(taskMapper.markProviderCallStarted(301L, NOW)).thenReturn(0);

        GenerationTaskExecutionService service = new GenerationTaskExecutionService(taskMapper,
                mock(GenerationImageMapper.class), mock(OutboxEventMapper.class),
                mock(UserGenerationDailyUsageMapper.class), bailianClient, providerCallGate,
                mock(GenerationImageTransferService.class), transactionManager(), bailianProperties(),
                Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(service.execute(new TaskExecuteMessage(11L, 301L, 0))).isTrue();

        verify(bailianClient, never()).generate(queuedTask);
    }

    @Test
    void restoresSavedProviderSnapshotWithoutCallingBailianAgain() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OutboxEventMapper outboxEventMapper = mock(OutboxEventMapper.class);
        GenerationBailianClient bailianClient = mock(GenerationBailianClient.class);
        GenerationImageTransferService imageTransferService = mock(GenerationImageTransferService.class);
        GenerationTask recoveredTask = task("RUNNING", 1);
        recoveredTask.setProviderResultSnapshot("saved-snapshot");
        GenerationTask currentTask = task("RUNNING", 1);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(recoveredTask, currentTask);
        GenerationBailianClient.ProviderResult providerResult = new GenerationBailianClient.ProviderResult(
                "request-1", List.of("https://provider.example/image.png"), 1, 2048, 2048, "saved-snapshot");
        when(bailianClient.restore("saved-snapshot")).thenReturn(providerResult);
        when(imageTransferService.transfer(recoveredTask, providerResult.imageUrls())).thenReturn(List.of(
                new GenerationImageTransferService.TransferredImage(0,
                        "users/7/tasks/301/0.png", 1024, 2048, 2048)));
        when(taskMapper.completeRunning(301L, "SUCCEEDED", 1, null, NOW)).thenReturn(1);

        GenerationTaskExecutionService service = new GenerationTaskExecutionService(taskMapper, imageMapper,
                outboxEventMapper, mock(UserGenerationDailyUsageMapper.class), bailianClient,
                mock(GenerationProviderCallGate.class), imageTransferService, transactionManager(), bailianProperties(),
                Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(service.execute(new TaskExecuteMessage(11L, 301L, 1))).isTrue();

        verify(bailianClient).restore("saved-snapshot");
        verify(bailianClient, never()).generate(any());
        verify(taskMapper).completeRunning(301L, "SUCCEEDED", 1, null, NOW);
    }

    @Test
    void requeuesMessageWhenInterruptedWhileWaitingForProviderPermit() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationProviderCallGate providerCallGate = mock(GenerationProviderCallGate.class);
        GenerationTask queuedTask = task("QUEUED", 0);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queuedTask);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(providerCallGate.acquire()).thenThrow(new InterruptedException("stopping"));

        GenerationTaskExecutionService service = new GenerationTaskExecutionService(taskMapper,
                mock(GenerationImageMapper.class), mock(OutboxEventMapper.class),
                mock(UserGenerationDailyUsageMapper.class), mock(GenerationBailianClient.class), providerCallGate,
                mock(GenerationImageTransferService.class), transactionManager(), bailianProperties(),
                Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(service.execute(new TaskExecuteMessage(11L, 301L, 0))).isFalse();
        assertThat(Thread.interrupted()).isTrue();
        verify(taskMapper, never()).markProviderCallStarted(anyLong(), any());
    }

    @Test
    void requeuesOnProviderRateLimitWithDelayedExecutionEvent() throws Exception {
        assertRetryableFailure(new BailianProviderException(429, "Throttling", "request-1", "limited"));
    }

    @Test
    void requeuesOnProviderServerErrorWithDelayedExecutionEvent() throws Exception {
        assertRetryableFailure(new BailianProviderException(503, null, "request-1", "unavailable"));
    }

    @Test
    void requeuesWhenConnectionWasNotEstablished() throws Exception {
        assertRetryableFailure(new BailianConnectionException(new ConnectException("refused")));
    }

    @Test
    void publishesFailedStateWhenProviderRejectsContent() throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        OutboxEventMapper outboxEventMapper = mock(OutboxEventMapper.class);
        GenerationBailianClient bailianClient = mock(GenerationBailianClient.class);
        GenerationProviderCallGate providerCallGate = mock(GenerationProviderCallGate.class);
        when(providerCallGate.acquire()).thenReturn(mock(GenerationProviderCallGate.Permit.class));
        GenerationTask queuedTask = task("QUEUED", 0);
        GenerationTask runningTask = task("RUNNING", 1);
        runningTask.setAttemptCount(0);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queuedTask, runningTask);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(taskMapper.markProviderCallStarted(301L, NOW)).thenReturn(1);
        when(bailianClient.generate(queuedTask)).thenThrow(
                new BailianProviderException(400, "DataInspectionFailed", "request-1", "rejected"));
        when(taskMapper.failRunning(301L, "PROVIDER_CONTENT_REJECTED", null, NOW)).thenReturn(1);

        GenerationTaskExecutionService service = new GenerationTaskExecutionService(taskMapper,
                mock(GenerationImageMapper.class), outboxEventMapper, mock(UserGenerationDailyUsageMapper.class),
                bailianClient, providerCallGate, mock(GenerationImageTransferService.class), transactionManager(),
                bailianProperties(), Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(service.execute(new TaskExecuteMessage(11L, 301L, 0))).isTrue();
        ArgumentCaptor<OutboxEvent> events = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventMapper, org.mockito.Mockito.times(2)).insertSelective(events.capture());
        assertThat(events.getAllValues()).extracting(OutboxEvent::getPayloadJson)
                .containsExactly("{\"status\":\"RUNNING\",\"modelRetryCount\":0}",
                        "{\"status\":\"FAILED\",\"modelRetryCount\":0}");
    }

    private static void assertRetryableFailure(RuntimeException failure) throws Exception {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        OutboxEventMapper outboxEventMapper = mock(OutboxEventMapper.class);
        GenerationBailianClient bailianClient = mock(GenerationBailianClient.class);
        GenerationProviderCallGate providerCallGate = mock(GenerationProviderCallGate.class);
        when(providerCallGate.acquire()).thenReturn(mock(GenerationProviderCallGate.Permit.class));
        GenerationTask queuedTask = task("QUEUED", 0);
        GenerationTask runningTask = task("RUNNING", 1);
        runningTask.setAttemptCount(0);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queuedTask, runningTask);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(taskMapper.markProviderCallStarted(301L, NOW)).thenReturn(1);
        when(bailianClient.generate(queuedTask)).thenThrow(failure);
        when(taskMapper.requeueRunningForRetry(301L, 1, NOW)).thenReturn(1);

        GenerationTaskExecutionService service = new GenerationTaskExecutionService(taskMapper,
                mock(GenerationImageMapper.class), outboxEventMapper, mock(UserGenerationDailyUsageMapper.class),
                bailianClient, providerCallGate, mock(GenerationImageTransferService.class), transactionManager(),
                bailianProperties(), Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(service.execute(new TaskExecuteMessage(11L, 301L, 0))).isTrue();
        verify(taskMapper).requeueRunningForRetry(301L, 1, NOW);
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventMapper, org.mockito.Mockito.times(3)).insertSelective(event.capture());
        assertThat(event.getAllValues()).extracting(OutboxEvent::getEventType)
                .containsExactly("GENERATION_TASK_STATUS_CHANGED", "GENERATION_TASK_EXECUTE",
                        "GENERATION_TASK_STATUS_CHANGED");
        assertThat(event.getAllValues().get(1).getAggregateVersion()).isEqualTo(2L);
        assertThat(event.getAllValues().get(1).getAvailableAt()).isBetween(NOW.plusSeconds(1), NOW.plusSeconds(2));
        assertThat(event.getAllValues().get(2).getPayloadJson())
                .isEqualTo("{\"status\":\"QUEUED\",\"modelRetryCount\":1}");
    }

    private static PlatformTransactionManager transactionManager() {
        PlatformTransactionManager transactionManager = mock(PlatformTransactionManager.class);
        when(transactionManager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        return transactionManager;
    }

    private static GenerationBailianProperties bailianProperties() {
        return new GenerationBailianProperties("https://example.com", "key", java.time.Duration.ofSeconds(5),
                java.time.Duration.ofSeconds(330), 25, 2, 3);
    }

    private static GenerationTask task(String status, int taskVersion) {
        GenerationTask task = new GenerationTask();
        task.setId(301L);
        task.setUserId(7L);
        task.setStatus(status);
        task.setTaskVersion(taskVersion);
        task.setModel("bailian/qwen-image-2.0");
        task.setFinalPrompt("one future city");
        task.setWidth(2048);
        task.setHeight(2048);
        task.setRequestedImageCount(1);
        task.setCreatedAt(NOW);
        return task;
    }
}
