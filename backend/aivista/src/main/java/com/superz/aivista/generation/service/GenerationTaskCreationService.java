package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.CreateGenerationTaskRequest;
import com.superz.aivista.generation.dto.CreateGenerationTaskResponse;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.model.CreationMode;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 原子创建普通文生图会话、消息、任务、额度记录与执行 Outbox 事件。 */
@Service
public class GenerationTaskCreationService {
    private final UserMapper userMapper;
    private final CreationTaskStartService creationStartService;
    private final GenerationTaskProvisioningService provisioningService;
    private final GenerationTaskSpecificationValidator specificationValidator;
    private final Clock clock;

    public GenerationTaskCreationService(
            UserMapper userMapper,
            CreationTaskStartService creationStartService,
            GenerationTaskProvisioningService provisioningService,
            GenerationTaskSpecificationValidator specificationValidator,
            Clock clock) {
        this.userMapper = userMapper;
        this.creationStartService = creationStartService;
        this.provisioningService = provisioningService;
        this.specificationValidator = specificationValidator;
        this.clock = clock;
    }

    @Transactional
    public CreateGenerationTaskResponse create(long userId, CreateGenerationTaskRequest request) {
        CreationCommand command = validateAndNormalize(request);
        // 所有创建请求先锁用户行：串行化跨会话的并发数与每日额度判断。
        if (userMapper.selectIdForUpdate(userId) == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }

        Instant now = clock.instant();
        // 已有会话会在 loadOrCreateSession 中继续加锁，锁顺序始终是“用户 → 会话”。
        var started = creationStartService.start(userId, command.sessionId(), command.prompt(),
                CreationMode.NORMAL.name(), command.inputAssetIds(), true, now);
        GenerationTask task = provisioningService.create(userId, started.session().getId(), started.creation().getId(),
                new GenerationTaskSpecification(command.prompt(), command.negativePrompt(), command.aspectRatio(),
                        command.promptExtend(), command.imageCount(), command.inputAssetIds()), now);

        return responseOf(task);
    }

    private CreationCommand validateAndNormalize(CreateGenerationTaskRequest request) {
        if (request == null) throw invalid("生成请求不能为空");
        GenerationTaskSpecification specification = specificationValidator.validate(
                request.prompt(), request.negativePrompt(), request.aspectRatio(), request.promptExtend(),
                request.imageCount(), request.inputAssetIds());

        Long sessionId = CreationTaskStartService.parseSessionId(request.sessionId());
        List<Long> inputAssetIds = specification.inputAssetIds();
        return new CreationCommand(sessionId, specification.prompt(), specification.negativePrompt(),
                specification.aspectRatio(), specification.promptExtend(), specification.imageCount(),
                inputAssetIds);
    }

    private CreateGenerationTaskResponse responseOf(GenerationTask task) {
        return new CreateGenerationTaskResponse(
                Long.toString(task.getId()),
                Long.toString(task.getSessionId()),
                task.getStatus(),
                task.getRevision(),
                task.getRequestedImageCount(),
                task.getCreatedAt());
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
    }

    private record CreationCommand(
            Long sessionId,
            String prompt,
            String negativePrompt,
            String aspectRatio,
            boolean promptExtend,
            int imageCount,
            List<Long> inputAssetIds) {
    }

}
