package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
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
import com.superz.aivista.generation.message.ImageTransferMessage;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class GenerationImageTransferExecutionServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-20T12:00:00Z");

    @Test
    void restoresDatabaseSnapshotAndPersistsSuccessfulTransfer() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationBailianClient client = mock(GenerationBailianClient.class);
        GenerationImageTransferService transferService = mock(GenerationImageTransferService.class);
        GenerationTask waiting = task("TRANSFERRING", 2);
        GenerationTask current = task("TRANSFERRING", 2);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(waiting, current);
        when(taskMapper.markTransferStarted(301L, 2, NOW)).thenReturn(1);
        GenerationBailianClient.ProviderResult result = result(1);
        when(client.restore("snapshot")).thenReturn(result);
        var transferred = new GenerationImageTransferService.TransferredImage(
                0, "users/7/tasks/301/0.png", 1024, 2048, 2048);
        when(transferService.transfer(waiting, result.imageUrls())).thenReturn(List.of(transferred));
        when(taskMapper.completeTransferring(301L, 2, "SUCCEEDED", 1, null, NOW)).thenReturn(1);

        assertThat(service(taskMapper, imageMapper, outboxMapper, client, transferService)
                .execute(new ImageTransferMessage(12L, 301L, 2))).isTrue();

        verify(client).restore("snapshot");
        verify(taskMapper).markTransferStarted(301L, 2, NOW);
        verify(taskMapper).completeTransferring(301L, 2, "SUCCEEDED", 1, null, NOW);
        ArgumentCaptor<GenerationImage> image = ArgumentCaptor.forClass(GenerationImage.class);
        verify(imageMapper).insertSelective(image.capture());
        assertThat(image.getValue().getObjectKey()).isEqualTo("users/7/tasks/301/0.png");
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxMapper).insertSelective(event.capture());
        assertThat(event.getValue().getPayloadJson())
                .isEqualTo("{\"status\":\"SUCCEEDED\",\"modelRetryCount\":0}");
    }

    @Test
    void convergesPartialTransferWithoutRetryingFailedImage() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        GenerationBailianClient client = mock(GenerationBailianClient.class);
        GenerationImageTransferService transferService = mock(GenerationImageTransferService.class);
        GenerationTask waiting = task("TRANSFERRING", 2);
        GenerationTask current = task("TRANSFERRING", 2);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(waiting, current);
        when(taskMapper.markTransferStarted(301L, 2, NOW)).thenReturn(1);
        GenerationBailianClient.ProviderResult result = result(2);
        when(client.restore("snapshot")).thenReturn(result);
        when(transferService.transfer(waiting, result.imageUrls())).thenReturn(List.of(
                new GenerationImageTransferService.TransferredImage(
                        0, "users/7/tasks/301/0.png", 1024, 2048, 2048)));
        when(taskMapper.completeTransferring(301L, 2, "PARTIALLY_SUCCEEDED", 1,
                "IMAGE_TRANSFER_PARTIAL_FAILURE", NOW)).thenReturn(1);

        assertThat(service(taskMapper, imageMapper, mock(OutboxEventMapper.class), client, transferService)
                .execute(new ImageTransferMessage(12L, 301L, 2))).isTrue();

        verify(taskMapper).completeTransferring(301L, 2, "PARTIALLY_SUCCEEDED", 1,
                "IMAGE_TRANSFER_PARTIAL_FAILURE", NOW);
    }

    @Test
    void deletesUploadedObjectsWhenCancellationWinsCompletionRace() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationBailianClient client = mock(GenerationBailianClient.class);
        GenerationImageTransferService transferService = mock(GenerationImageTransferService.class);
        GenerationTask waiting = task("TRANSFERRING", 2);
        when(taskMapper.selectByIdForUpdate(301L)).thenReturn(waiting, task("CANCELLED", 3));
        when(taskMapper.markTransferStarted(301L, 2, NOW)).thenReturn(1);
        GenerationBailianClient.ProviderResult result = result(1);
        when(client.restore("snapshot")).thenReturn(result);
        List<GenerationImageTransferService.TransferredImage> images = List.of(
                new GenerationImageTransferService.TransferredImage(
                        0, "users/7/tasks/301/0.png", 1024, 2048, 2048));
        when(transferService.transfer(waiting, result.imageUrls())).thenReturn(images);

        assertThat(service(taskMapper, mock(GenerationImageMapper.class), mock(OutboxEventMapper.class),
                client, transferService).execute(new ImageTransferMessage(12L, 301L, 2))).isTrue();

        verify(transferService).deleteTransferred(images);
        verify(taskMapper, never()).completeTransferring(anyLong(), anyInt(),
                any(), anyInt(), any(), any());
    }

    private static GenerationImageTransferExecutionService service(GenerationTaskMapper taskMapper,
            GenerationImageMapper imageMapper, OutboxEventMapper outboxMapper,
            GenerationBailianClient client, GenerationImageTransferService transferService) {
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        return new GenerationImageTransferExecutionService(taskMapper, imageMapper, outboxMapper,
                client, transferService, manager, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationBailianClient.ProviderResult result(int count) {
        List<String> urls = count == 1
                ? List.of("https://provider.example/0.png")
                : List.of("https://provider.example/0.png", "https://provider.example/1.png");
        return new GenerationBailianClient.ProviderResult(
                "request-1", urls, count, 2048, 2048, "snapshot");
    }

    private static GenerationTask task(String status, int version) {
        GenerationTask task = new GenerationTask();
        task.setId(301L);
        task.setUserId(7L);
        task.setStatus(status);
        task.setTaskVersion(version);
        task.setAttemptCount(0);
        task.setProviderResultSnapshot("snapshot");
        task.setWidth(2048);
        task.setHeight(2048);
        return task;
    }
}
