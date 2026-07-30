package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.GenerationImage;
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
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class GenerationTaskExecutionServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-29T02:00:00Z");

    @Test
    void executesOneImageTaskThenPersistsImageTerminalStateAndStatusEvent() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OutboxEventMapper outboxEventMapper = mock(OutboxEventMapper.class);
        UserGenerationDailyUsageMapper dailyUsageMapper = mock(UserGenerationDailyUsageMapper.class);
        GenerationBailianClient bailianClient = mock(GenerationBailianClient.class);
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
                outboxEventMapper, dailyUsageMapper, bailianClient, imageTransferService,
                transactionManager, Clock.fixed(NOW, ZoneOffset.UTC));

        boolean canAcknowledge = service.execute(new TaskExecuteMessage(11L, 301L, 0));

        assertThat(canAcknowledge).isTrue();
        verify(taskMapper).markProviderCallStarted(301L, NOW);
        verify(taskMapper).saveProviderResult(301L, "request-1", "snapshot", NOW);
        verify(taskMapper).completeRunning(301L, "SUCCEEDED", 1, null, NOW);
        ArgumentCaptor<GenerationImage> image = ArgumentCaptor.forClass(GenerationImage.class);
        verify(imageMapper).insertSelective(image.capture());
        assertThat(image.getValue().getTaskId()).isEqualTo(301L);
        assertThat(image.getValue().getObjectKey()).isEqualTo("users/7/tasks/301/0.png");
        assertThat(image.getValue().getWidth()).isEqualTo(2048);
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventMapper).insertSelective(event.capture());
        assertThat(event.getValue().getEventType()).isEqualTo("TASK_STATUS_CHANGED");
        assertThat(event.getValue().getTaskId()).isEqualTo(301L);
        assertThat(event.getValue().getTaskVersion()).isEqualTo(2);
    }

    @Test
    void doesNotCallProviderWhenCancellationWinsBeforeCallStarts() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationBailianClient bailianClient = mock(GenerationBailianClient.class);
        GenerationTask queuedTask = task("QUEUED", 0);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(queuedTask);
        when(taskMapper.claimQueuedForExecution(301L, 0, NOW)).thenReturn(1);
        when(taskMapper.markProviderCallStarted(301L, NOW)).thenReturn(0);

        GenerationTaskExecutionService service = new GenerationTaskExecutionService(taskMapper,
                mock(GenerationImageMapper.class), mock(OutboxEventMapper.class),
                mock(UserGenerationDailyUsageMapper.class), bailianClient,
                mock(GenerationImageTransferService.class), transactionManager(), Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(service.execute(new TaskExecuteMessage(11L, 301L, 0))).isTrue();

        verify(bailianClient, never()).generate(queuedTask);
    }

    private static PlatformTransactionManager transactionManager() {
        PlatformTransactionManager transactionManager = mock(PlatformTransactionManager.class);
        when(transactionManager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        return transactionManager;
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
