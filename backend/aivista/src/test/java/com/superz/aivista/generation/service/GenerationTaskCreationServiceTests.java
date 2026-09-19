package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.config.GenerationTaskProperties;
import com.superz.aivista.generation.dto.CreateGenerationTaskRequest;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GenerationTaskCreationServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-28T01:02:03Z");
    private final UserMapper users = mock(UserMapper.class);
    private final CreationTaskStartService starts = mock(CreationTaskStartService.class);
    private final GenerationTaskProvisioningService provisioning = mock(GenerationTaskProvisioningService.class);

    @Test
    void createsANormalTaskWithoutPersistingAReplayRecord() {
        GenerationSession session = new GenerationSession();
        session.setId(101L);
        CreationTask creation = new CreationTask();
        creation.setId(151L);
        when(users.selectIdForUpdate(7L)).thenReturn(7L);
        when(starts.start(7L, null, "future city", "NORMAL", java.util.List.of(), true, NOW))
                .thenReturn(new CreationTaskStartService.StartedCreation(session, creation));
        GenerationTask task = task();
        when(provisioning.create(org.mockito.ArgumentMatchers.eq(7L),
                org.mockito.ArgumentMatchers.eq(101L), org.mockito.ArgumentMatchers.eq(151L), any(),
                org.mockito.ArgumentMatchers.eq(NOW))).thenReturn(task);
        var properties = new GenerationTaskProperties("model", 4, 12, 1000, 500, 1, 6,
                Map.of("1:1", "2048*2048"));
        var service = new GenerationTaskCreationService(users, starts, provisioning,
                new GenerationTaskSpecificationValidator(properties), Clock.fixed(NOW, ZoneOffset.UTC));

        var response = service.create(7L,
                new CreateGenerationTaskRequest(null, "future city", null, null, "1:1", true, 1));

        assertThat(response.generationTaskId()).isEqualTo("301");
        ArgumentCaptor<GenerationTaskSpecification> specification =
                ArgumentCaptor.forClass(GenerationTaskSpecification.class);
        verify(provisioning).create(org.mockito.ArgumentMatchers.eq(7L),
                org.mockito.ArgumentMatchers.eq(101L), org.mockito.ArgumentMatchers.eq(151L),
                specification.capture(), org.mockito.ArgumentMatchers.eq(NOW));
        assertThat(specification.getValue().prompt()).isEqualTo("future city");
    }

    private static GenerationTask task() {
        GenerationTask task = new GenerationTask();
        task.setId(301L);
        task.setSessionId(101L);
        task.setStatus("QUEUED");
        task.setRevision(0);
        task.setRequestedImageCount(1);
        task.setCreatedAt(NOW);
        return task;
    }
}
