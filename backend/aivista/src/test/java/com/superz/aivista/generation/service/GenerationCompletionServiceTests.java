package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import com.superz.aivista.generation.message.GenerationCompletionCommand;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationCompletionServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-08T00:00:00Z");
    private final GenerationTaskMapper tasks = mock(GenerationTaskMapper.class);
    private final CreationTaskMapper creations = mock(CreationTaskMapper.class);
    private final ImageAssetMapper images = mock(ImageAssetMapper.class);
    private final OutboxEventMapper outbox = mock(OutboxEventMapper.class);
    private final UserGenerationDailyUsageMapper usage = mock(UserGenerationDailyUsageMapper.class);
    private final GenerationCompletionService service = new GenerationCompletionService(tasks, creations, images, outbox, usage,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void completionCommitsImagesAndDerivesTheFinalStatus() {
        GenerationTask saving = task("SAVING", 2);
        GenerationTask succeeded = task("SUCCEEDED", 3);
        when(tasks.selectByIdForUpdate(101L)).thenReturn(saving, succeeded);
        when(creations.selectByIdForUpdate(151L)).thenReturn(normalCreation());
        when(tasks.completeActivePipeline(101L, 2, "SUCCEEDED", 1, null, "provider-1", NOW)).thenReturn(1);
        when(images.selectByOriginTaskId(101L)).thenReturn(List.of());
        var image = new GenerationCompletionCommand.CompletedImage(0, "users/7/tasks/101/0", "image/png",
                "12345", 2048, 2048);

        var response = service.complete(new GenerationCompletionCommand(1, "101", 2,
                "COMPLETED", "provider-1", 1, null, List.of(image)));

        assertThat(response.status()).isEqualTo("SUCCEEDED");
        verify(images).insertSelective(org.mockito.ArgumentMatchers.argThat(asset ->
                "users/7/tasks/101/0/original.png".equals(asset.getOriginalObjectKey())));
        verify(tasks).completeActivePipeline(101L, 2, "SUCCEEDED", 1, null, "provider-1", NOW);
        verify(creations).completeRunning(151L, 0L, "SUCCEEDED", null, NOW);
    }

    @Test
    void terminalTaskMakesCompletionAnIdempotentRead() {
        GenerationTask succeeded = task("SUCCEEDED", 2);
        when(tasks.selectByIdForUpdate(101L)).thenReturn(succeeded);
        when(images.selectByOriginTaskId(101L)).thenReturn(List.of());

        var response = service.complete(new GenerationCompletionCommand(1, "101", 1,
                "FAILED", null, null, "PROVIDER_CONFIGURATION_ERROR", null));

        assertThat(response.status()).isEqualTo("SUCCEEDED");
        verify(tasks, never()).failActivePipeline(org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void readsACommittedTerminalSnapshotForWorkerRedelivery() {
        GenerationTask succeeded = task("SUCCEEDED", 3);
        when(tasks.selectTaskById(101L)).thenReturn(succeeded);
        when(images.selectByOriginTaskId(101L)).thenReturn(List.of());

        var response = service.get(101L);

        assertThat(response.status()).isEqualTo("SUCCEEDED");
        assertThat(response.revision()).isEqualTo(3);
    }

    private static GenerationTask task(String status, int version) {
        GenerationTask task = new GenerationTask();
        task.setId(101L);
        task.setUserId(7L);
        task.setCreationTaskId(151L);
        task.setStatus(status);
        task.setRevision(version);
        task.setAttemptCount(0);
        task.setWidth(2048);
        task.setHeight(2048);
        task.setRequestedImageCount(1);
        task.setCreatedAt(NOW);
        return task;
    }

    private static CreationTask normalCreation() {
        CreationTask creation = new CreationTask();
        creation.setId(151L);
        creation.setMode("NORMAL");
        creation.setStatus("RUNNING");
        creation.setRevision(0L);
        return creation;
    }
}
