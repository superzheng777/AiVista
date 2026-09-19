package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.CreateAgentCreationRequest;
import com.superz.aivista.generation.dto.CreateAgentCreationResponse;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.CreationMode;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 原子创建 Agent Creation、用户消息与可靠执行命令。 */
@Service
public class AgentCreationService {
    private final UserMapper users;
    private final ImageAssetMapper assets;
    private final OutboxEventMapper outbox;
    private final CreationTaskStartService creationStart;
    private final GenerationTaskSpecificationValidator validator;
    private final Clock clock;

    public AgentCreationService(UserMapper users, ImageAssetMapper assets,
            OutboxEventMapper outbox,
            CreationTaskStartService creationStart, GenerationTaskSpecificationValidator validator,
            Clock clock) {
        this.users = users;
        this.assets = assets;
        this.outbox = outbox;
        this.creationStart = creationStart;
        this.validator = validator;
        this.clock = clock;
    }

    @Transactional
    public CreateAgentCreationResponse create(long userId, CreateAgentCreationRequest request) {
        Command command = normalize(request);
        if (users.selectIdForUpdate(userId) == null) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        Instant now = clock.instant();
        authorizeAssets(userId, command.inputAssetIds());

        var started = creationStart.start(userId, command.sessionId(), command.prompt(),
                CreationMode.AGENT.name(), command.inputAssetIds(), false,
                command.aspectRatio(), command.imageCount(), now);
        var creation = started.creation();
        OutboxEvent execute = new OutboxEvent();
        execute.setEventType(OutboxEventType.AGENT_EXECUTE.name());
        execute.setAggregateType("CREATION_TASK");
        execute.setAggregateId(creation.getId());
        execute.setAggregateVersion(creation.getRevision());
        execute.setStatus(OutboxStatus.PENDING.name());
        execute.setRetryCount(0);
        execute.setAvailableAt(now);
        execute.setCreatedAt(now);
        execute.setUpdatedAt(now);
        outbox.insertSelective(execute);

        return new CreateAgentCreationResponse(
                creation.getId().toString(), started.session().getId().toString(),
                creation.getStatus(), creation.getRevision(), creation.getCreatedAt());
    }

    private Command normalize(CreateAgentCreationRequest request) {
        if (request == null) throw invalid("Agent 创作请求不能为空");
        String prompt = validator.validateAgentPrompt(request.prompt());
        List<Long> inputAssetIds = GenerationTaskSpecificationValidator.normalizeInputAssetIds(
                request.inputAssetIds());
        Long sessionId = CreationTaskStartService.parseSessionId(request.sessionId());
        String aspectRatio = validator.validateAgentAspectRatio(request.aspectRatio());
        int imageCount = validator.validateAgentImageCount(request.imageCount());
        return new Command(sessionId, prompt, inputAssetIds, aspectRatio, imageCount);
    }

    private void authorizeAssets(long userId, List<Long> inputAssetIds) {
        if (inputAssetIds.isEmpty()) return;
        List<ImageAsset> usable = assets.selectUsableInputsForUpdate(userId, inputAssetIds);
        if (usable.size() != inputAssetIds.size()) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, message);
    }

    private record Command(Long sessionId, String prompt, List<Long> inputAssetIds,
            String aspectRatio, int imageCount) {
    }
}
