package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.CreateAgentGenerationTaskRequest;
import com.superz.aivista.generation.dto.CreateGenerationTaskResponse;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.mapper.CreationTaskInputAssetMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.model.CreationMode;
import com.superz.aivista.generation.model.GenerationOperation;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Idempotently creates a generation task under an existing Agent Creation. */
@Service
public class AgentGenerationTaskCreationService {
    private final CreationTaskMapper creationTaskMapper;
    private final UserMapper userMapper;
    private final CreationTaskInputAssetMapper creationInputAssets;
    private final GenerationTaskMapper generationTasks;
    private final GenerationTaskSpecificationValidator specificationValidator;
    private final GenerationTaskProvisioningService provisioningService;
    private final Clock clock;

    public AgentGenerationTaskCreationService(CreationTaskMapper creationTaskMapper, UserMapper userMapper,
            CreationTaskInputAssetMapper creationInputAssets,
            GenerationTaskMapper generationTasks,
            GenerationTaskSpecificationValidator specificationValidator,
            GenerationTaskProvisioningService provisioningService, Clock clock) {
        this.creationTaskMapper = creationTaskMapper;
        this.userMapper = userMapper;
        this.creationInputAssets = creationInputAssets;
        this.generationTasks = generationTasks;
        this.specificationValidator = specificationValidator;
        this.provisioningService = provisioningService;
        this.clock = clock;
    }

    @Transactional
    public CreateGenerationTaskResponse create(long creationTaskId, String toolCallId,
            CreateAgentGenerationTaskRequest request) {
        if (request == null || toolCallId == null || toolCallId.isBlank()
                || toolCallId.length() > 128) {
            throw invalid("toolCallId：不能为空且不能超过 128 个字符");
        }
        CreationTask snapshot = creationTaskMapper.selectSnapshotById(creationTaskId);
        if (snapshot == null || !CreationMode.AGENT.name().equals(snapshot.getMode())) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        long userId = snapshot.getUserId();
        if (userMapper.selectIdForUpdate(userId) == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        CreationTask creation = creationTaskMapper.selectByIdForUpdate(creationTaskId);
        if (creation == null || creation.getUserId() != userId
                || !CreationMode.AGENT.name().equals(creation.getMode())) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        if (!"RUNNING".equals(creation.getStatus())) {
            throw new BusinessException(ErrorCode.AGENT_CREATION_NOT_RUNNING);
        }

        GenerationTaskSpecification specification = specificationValidator.validate(
                request.prompt(), request.negativePrompt(), request.aspectRatio(), request.promptExtend(),
                request.imageCount(), request.inputAssetIds());
        String expectedOperation = specification.inputAssetIds().isEmpty()
                ? GenerationOperation.TEXT_TO_IMAGE.name() : GenerationOperation.IMAGE_TO_IMAGE.name();
        if (!expectedOperation.equals(request.operation())) {
            throw invalid("operation：必须与输入图片数量一致");
        }
        if (!"AUTO".equals(creation.getRequestedAspectRatio())
                && !creation.getRequestedAspectRatio().equals(specification.aspectRatio())) {
            throw invalid("aspectRatio：必须符合用户为本轮指定的画幅比例");
        }
        if (!creationInputAssets.selectAssetIdsByCreationTaskId(creationTaskId)
                .containsAll(specification.inputAssetIds())) {
            throw new BusinessException(ErrorCode.MEDIA_FORBIDDEN);
        }
        Instant now = clock.instant();
        GenerationTask existing = generationTasks.selectByCreationTaskIdAndToolCallIdForUpdate(
                creationTaskId, toolCallId);
        if (existing != null) {
            if (!provisioningService.matches(existing, specification)) {
                throw new BusinessException(ErrorCode.AGENT_TOOL_CALL_CONFLICT);
            }
            return responseOf(existing);
        }
        if (creation.getRequestedImageCount() > 0) {
            int allocated = generationTasks.sumEffectiveRequestedImagesByCreationTaskId(creationTaskId);
            if (allocated + specification.imageCount() > creation.getRequestedImageCount()) {
                throw invalid("imageCount：本轮生成图片总数不能超过用户指定数量");
            }
        }

        GenerationTask task = provisioningService.create(userId, creation.getSessionId(), creationTaskId,
                toolCallId, specification, now);
        return responseOf(task);
    }

    private static CreateGenerationTaskResponse responseOf(GenerationTask task) {
        return new CreateGenerationTaskResponse(Long.toString(task.getId()), Long.toString(task.getSessionId()),
                task.getStatus(), task.getRevision(), task.getRequestedImageCount(), task.getCreatedAt());
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
    }
}
