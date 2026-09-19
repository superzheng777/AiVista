package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationTaskProperties;
import com.superz.aivista.generation.dto.CreateAgentGenerationTaskRequest;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.CreationTaskInputAssetMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AgentGenerationTaskCreationServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-09T02:00:00Z");
    private final CreationTaskMapper creations = mock(CreationTaskMapper.class);
    private final UserMapper users = mock(UserMapper.class);
    private final CreationTaskInputAssetMapper creationInputs = mock(CreationTaskInputAssetMapper.class);
    private final GenerationTaskMapper generationTasks = mock(GenerationTaskMapper.class);
    private final GenerationTaskProvisioningService provisioning = mock(GenerationTaskProvisioningService.class);
    private AgentGenerationTaskCreationService service;

    @BeforeEach
    void setUp() {
        var properties = new GenerationTaskProperties("model", 4, 12, 1000, 500, 1, 6,
                Map.of("3:4", "1536*2048"));
        service = new AgentGenerationTaskCreationService(creations, users, creationInputs, generationTasks,
                new GenerationTaskSpecificationValidator(properties), provisioning,
                Clock.fixed(NOW, ZoneOffset.UTC));
        CreationTask creation = creation();
        when(creations.selectSnapshotById(151L)).thenReturn(creation);
        when(users.selectIdForUpdate(7L)).thenReturn(7L);
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation);
        when(creationInputs.selectAssetIdsByCreationTaskId(151L)).thenReturn(List.of());
    }

    @Test
    void createsWithTheToolCallIdentity() {
        GenerationTask task = task();
        when(provisioning.create(anyLong(), anyLong(), anyLong(),
                org.mockito.ArgumentMatchers.eq("call-1"), any(), any())).thenReturn(task);

        var response = service.create(151L, "call-1", request());

        assertThat(response.generationTaskId()).isEqualTo("301");
        verify(provisioning).create(org.mockito.ArgumentMatchers.eq(7L),
                org.mockito.ArgumentMatchers.eq(101L), org.mockito.ArgumentMatchers.eq(151L),
                org.mockito.ArgumentMatchers.eq("call-1"), any(), org.mockito.ArgumentMatchers.eq(NOW));
    }

    @Test
    void returnsTheExistingTaskForAnIdenticalRequest() {
        GenerationTask existing = task();
        when(generationTasks.selectByCreationTaskIdAndToolCallIdForUpdate(151L, "call-1"))
                .thenReturn(existing);
        when(provisioning.matches(existing, specification())).thenReturn(true);

        var response = service.create(151L, "call-1", request());

        assertThat(response.generationTaskId()).isEqualTo("301");
        verify(provisioning, never()).create(anyLong(), anyLong(), anyLong(), any(), any(), any());
    }

    @Test
    void rejectsAReusedIdentityWithDifferentArguments() {
        GenerationTask existing = task();
        when(generationTasks.selectByCreationTaskIdAndToolCallIdForUpdate(151L, "call-1"))
                .thenReturn(existing);
        when(provisioning.matches(org.mockito.ArgumentMatchers.eq(existing), any())).thenReturn(false);

        assertThatThrownBy(() -> service.create(151L, "call-1", request()))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.AGENT_TOOL_CALL_CONFLICT));
    }

    private static CreateAgentGenerationTaskRequest request() {
        return new CreateAgentGenerationTaskRequest("TEXT_TO_IMAGE", "海报", null,
                "3:4", true, 1, List.of());
    }

    private static GenerationTaskSpecification specification() {
        return new GenerationTaskSpecification("海报", null, "3:4", true, 1, List.of());
    }

    private static CreationTask creation() {
        CreationTask creation = new CreationTask();
        creation.setId(151L);
        creation.setUserId(7L);
        creation.setSessionId(101L);
        creation.setMode("AGENT");
        creation.setRequestedAspectRatio("AUTO");
        creation.setRequestedImageCount(0);
        creation.setStatus("RUNNING");
        creation.setRevision(0L);
        return creation;
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
