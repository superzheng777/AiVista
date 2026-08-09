package com.superz.aivista.generation.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.idempotency.IdempotencyRecord;
import com.superz.aivista.common.idempotency.IdempotencyRecordMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationTaskProperties;
import com.superz.aivista.generation.dto.CreateGenerationTaskRequest;
import com.superz.aivista.generation.dto.CreateGenerationTaskResponse;
import com.superz.aivista.generation.dto.GenerationConsentResponse;
import com.superz.aivista.generation.entity.GenerationMessage;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.entity.UserGenerationDailyUsage;
import com.superz.aivista.generation.mapper.GenerationMessageMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import com.superz.aivista.generation.model.GenerationTaskStatus;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 原子创建普通文生图会话、消息、任务、额度记录与执行 Outbox 事件。 */
@Service
public class GenerationTaskCreationService {
    private static final String NEW_SESSION_IDENTITY = "NEW";
    private static final int HISTORY_FETCH_LIMIT = 1000;
    private static final ZoneId QUOTA_ZONE = ZoneId.of("Asia/Shanghai");
    private static final String IDEMPOTENCY_SCOPE = "GENERATION_TASK_CREATE";

    private final UserMapper userMapper;
    private final GenerationSessionMapper sessionMapper;
    private final GenerationMessageMapper messageMapper;
    private final GenerationTaskMapper taskMapper;
    private final UserGenerationDailyUsageMapper dailyUsageMapper;
    private final OutboxEventMapper outboxEventMapper;
    private final IdempotencyRecordMapper idempotencyRecordMapper;
    private final GenerationConsentService consentService;
    private final GenerationTaskProperties properties;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    public GenerationTaskCreationService(
            UserMapper userMapper,
            GenerationSessionMapper sessionMapper,
            GenerationMessageMapper messageMapper,
            GenerationTaskMapper taskMapper,
            UserGenerationDailyUsageMapper dailyUsageMapper,
            OutboxEventMapper outboxEventMapper,
            IdempotencyRecordMapper idempotencyRecordMapper,
            GenerationConsentService consentService,
            GenerationTaskProperties properties,
            Clock clock, ObjectMapper objectMapper) {
        this.userMapper = userMapper;
        this.sessionMapper = sessionMapper;
        this.messageMapper = messageMapper;
        this.taskMapper = taskMapper;
        this.dailyUsageMapper = dailyUsageMapper;
        this.outboxEventMapper = outboxEventMapper;
        this.idempotencyRecordMapper = idempotencyRecordMapper;
        this.consentService = consentService;
        this.properties = properties;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CreateGenerationTaskResponse create(long userId, String idempotencyKey,
            CreateGenerationTaskRequest request) {
        CreationCommand command = validateAndNormalize(userId, idempotencyKey, request);
        GenerationConsentResponse consent = consentService.getCurrentConsent(userId);
        if (!consent.consented()) {
            throw new BusinessException(ErrorCode.GENERATION_CONSENT_REQUIRED);
        }

        // 所有创建请求先锁用户行：串行化跨会话的并发数与每日额度判断。
        if (userMapper.selectIdForUpdate(userId) == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }

        IdempotencyRecord existing = idempotencyRecordMapper.selectByOwnerScopeAndKey(
                userId, IDEMPOTENCY_SCOPE, command.idempotencyKey());
        if (existing != null) {
            return idempotentResponse(existing, command.requestFingerprint());
        }

        Instant now = clock.instant();
        // 已有会话会在 loadOrCreateSession 中继续加锁，锁顺序始终是“用户 → 会话”。
        GenerationSession session = loadOrCreateSession(userId, command, now);
        if (command.sessionId() != null && taskMapper.countActiveBySessionId(session.getId()) > 0) {
            throw new BusinessException(ErrorCode.SESSION_ACTIVE_TASK_EXISTS);
        }
        if (taskMapper.countActiveByUserId(userId) >= properties.maxActiveTasksPerUser()) {
            throw new BusinessException(ErrorCode.USER_GENERATION_CONCURRENCY_LIMIT);
        }

        LocalDate usageDate = LocalDate.ofInstant(now, QUOTA_ZONE);
        reserveDailyQuota(userId, usageDate, command.imageCount(), now);

        // 1000 条上限足以覆盖当前 1000 个正向 Unicode 码点预算下的最小消息粒度。
        List<GenerationMessage> history = command.sessionId() == null
                ? List.of()
                : messageMapper.selectRecentBySessionId(session.getId(), HISTORY_FETCH_LIMIT);
        String finalPrompt = GenerationPromptComposer.compose(command.prompt(), history,
                properties.maxPromptCodePoints(), false);
        String finalNegativePrompt = command.negativePrompt() == null
                ? null
                : GenerationPromptComposer.compose(command.negativePrompt(), history,
                        properties.maxNegativePromptCodePoints(), true);

        GenerationMessage message = new GenerationMessage();
        message.setSessionId(session.getId());
        message.setSequenceNo(nextMessageSequenceNo(command.sessionId(), session.getId()));
        message.setPrompt(command.prompt());
        message.setNegativePrompt(command.negativePrompt());
        message.setCreatedAt(now);
        messageMapper.insertSelective(message);
        if (command.sessionId() != null) {
            sessionMapper.updateLastMessageAt(session.getId(), now);
        }

        Dimension dimension = dimensionOf(command.aspectRatio());
        GenerationTask task = new GenerationTask();
        task.setUserId(userId);
        task.setSessionId(session.getId());
        task.setSourceMessageId(message.getId());
        task.setModel(properties.model());
        task.setStatus(GenerationTaskStatus.QUEUED.name());
        task.setTaskVersion(0);
        task.setAttemptCount(0);
        task.setFinalPrompt(finalPrompt);
        task.setFinalNegativePrompt(finalNegativePrompt);
        task.setWidth(dimension.width());
        task.setHeight(dimension.height());
        task.setPromptExtend(command.promptExtend());
        task.setRequestedImageCount(command.imageCount());
        task.setCompletedImageCount(0);
        task.setCreatedAt(now);
        task.setUpdatedAt(now);
        taskMapper.insertSelective(task);

        // 与任务同事务写入；提交后由后续 Outbox 分发器投递 RabbitMQ，避免“任务已创建但消息丢失”。
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.GENERATION_TASK_EXECUTE.name());
        event.setAggregateType("GENERATION_TASK");
        event.setAggregateId(task.getId());
        event.setAggregateVersion(task.getTaskVersion().longValue());
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        outboxEventMapper.insertSelective(event);
        outboxEventMapper.insertSelective(GenerationStatusOutboxEvent.create(
                task.getId(), task.getTaskVersion(), task.getStatus(), task.getAttemptCount(), now));

        CreateGenerationTaskResponse response = responseOf(task);
        saveIdempotencyRecord(userId, command, task.getId(), response, now);
        return response;
    }

    private CreationCommand validateAndNormalize(long userId, String idempotencyKey,
            CreateGenerationTaskRequest request) {
        if (request == null || !isCanonicalUuid(idempotencyKey)) {
            throw invalid("Idempotency-Key：必须是 UUID v4 格式");
        }
        GenerationPromptComposer.requireValidPrompt(
                "prompt", request.prompt(), properties.maxPromptCodePoints(), true);
        String negativePrompt = normalizeNegativePrompt(request.negativePrompt());
        GenerationPromptComposer.requireValidPrompt(
                "negativePrompt", negativePrompt, properties.maxNegativePromptCodePoints(), false);

        String aspectRatio = request.aspectRatio() == null ? null : request.aspectRatio().trim();
        if (aspectRatio == null || !properties.aspectRatios().containsKey(aspectRatio)) {
            throw invalid("aspectRatio：不受当前模型支持");
        }
        if (request.imageCount() == null || request.imageCount() < properties.minImageCount()
                || request.imageCount() > properties.maxImageCount()) {
            throw invalid("imageCount：不在当前模型允许范围内");
        }

        Long sessionId = parseSessionId(request.sessionId());
        // 新会话没有数据库 ID，使用稳定标识参与指纹，避免与已有会话请求混淆。
        String sessionIdentity = sessionId == null ? NEW_SESSION_IDENTITY : Long.toString(sessionId);
        boolean promptExtend = request.promptExtend() == null || request.promptExtend();
        String fingerprint = GenerationRequestFingerprint.sha256(
                userId, sessionIdentity, request.prompt(), negativePrompt, aspectRatio, promptExtend, request.imageCount());
        return new CreationCommand(sessionId, request.prompt(), negativePrompt, aspectRatio, promptExtend,
                request.imageCount(), idempotencyKey, fingerprint);
    }

    // 加载或新建会话
    private GenerationSession loadOrCreateSession(long userId, CreationCommand command, Instant now) {
        if (command.sessionId() != null) {
            GenerationSession session = sessionMapper.selectOwnedByIdForUpdate(command.sessionId(), userId);
            if (session == null) {
                throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
            }
            return session;
        }

        GenerationSession session = new GenerationSession();
        session.setUserId(userId);
        session.setTitle(defaultTitle(command.prompt()));
        session.setLastMessageAt(now);
        session.setCreatedAt(now);
        session.setUpdatedAt(now);
        sessionMapper.insertSelective(session);
        return session;
    }

    // 刷新用户每日额度
    private void reserveDailyQuota(long userId, LocalDate usageDate, int imageCount, Instant now) {
        // 用户行锁已避免同一用户并发插入；这里再锁用量行，给后续额度返还复用同一保护边界。
        UserGenerationDailyUsage usage = dailyUsageMapper.selectByUserIdAndUsageDateForUpdate(userId, usageDate);
        if (usage == null) {
            if (imageCount > properties.dailyImageQuota()) {
                throw new BusinessException(ErrorCode.DAILY_GENERATION_QUOTA_EXCEEDED);
            }
            UserGenerationDailyUsage created = new UserGenerationDailyUsage();
            created.setUserId(userId);
            created.setUsageDate(usageDate);
            created.setRequestedImageCount(imageCount);
            created.setUpdatedAt(now);
            dailyUsageMapper.insertSelective(created);
            return;
        }
        if (dailyUsageMapper.incrementWithinQuota(userId, usageDate, imageCount,
                properties.dailyImageQuota(), now) != 1) {
            throw new BusinessException(ErrorCode.DAILY_GENERATION_QUOTA_EXCEEDED);
        }
    }

    // 幂等响应
    private CreateGenerationTaskResponse idempotentResponse(IdempotencyRecord record, String fingerprint) {
        if (!fingerprint.equals(record.getRequestFingerprint())) {
            throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
        }
        try {
            var response = objectMapper.readTree(record.getResponseBody());
            return new CreateGenerationTaskResponse(
                    response.required("taskId").asText(),
                    response.required("sessionId").asText(),
                    response.required("status").asText(),
                    response.required("taskVersion").asInt(),
                    response.required("requestedImageCount").asInt(),
                    Instant.parse(response.required("createdAt").asText()));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Invalid persisted idempotency response", exception);
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Invalid persisted idempotency response", exception);
        }
    }

    private void saveIdempotencyRecord(long userId, CreationCommand command, long taskId,
            CreateGenerationTaskResponse response, Instant now) {
        try {
            IdempotencyRecord record = new IdempotencyRecord();
            record.setOwnerId(userId);
            record.setScope(IDEMPOTENCY_SCOPE);
            record.setIdempotencyKey(command.idempotencyKey());
            record.setRequestFingerprint(command.requestFingerprint());
            record.setResourceType("GENERATION_TASK");
            record.setResourceId(taskId);
            record.setResponseStatus(202);
            record.setResponseBody(objectMapper.writeValueAsString(Map.of(
                    "taskId", response.taskId(),
                    "sessionId", response.sessionId(),
                    "status", response.status(),
                    "taskVersion", response.taskVersion(),
                    "requestedImageCount", response.requestedImageCount(),
                    "createdAt", response.createdAt().toString())));
            record.setCreatedAt(now);
            record.setExpiresAt(now.plus(Duration.ofMinutes(30)));
            idempotencyRecordMapper.insertSelective(record);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot persist idempotency response", exception);
        }
    }

    private CreateGenerationTaskResponse responseOf(GenerationTask task) {
        return new CreateGenerationTaskResponse(
                Long.toString(task.getId()),
                Long.toString(task.getSessionId()),
                task.getStatus(),
                task.getTaskVersion(),
                task.getRequestedImageCount(),
                task.getCreatedAt());
    }

    private Dimension dimensionOf(String aspectRatio) {
        String size = properties.aspectRatios().get(aspectRatio);
        String[] parts = size.split("\\*", -1);
        if (parts.length != 2) {
            throw new IllegalStateException("Invalid configured generation size: " + size);
        }
        try {
            return new Dimension(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]));
        } catch (NumberFormatException exception) {
            throw new IllegalStateException("Invalid configured generation size: " + size, exception);
        }
    }

    private int nextMessageSequenceNo(Long sessionId, long persistedSessionId) {
        if (sessionId == null) {
            return 1;
        }
        Integer lastSequenceNo = messageMapper.selectLastSequenceNoForUpdate(persistedSessionId);
        return lastSequenceNo == null ? 1 : lastSequenceNo + 1;
    }

    private static boolean isCanonicalUuid(String value) {
        if (value == null) {
            return false;
        }
        try {
            UUID uuid = UUID.fromString(value);
            return uuid.version() == 4 && uuid.toString().equals(value);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static String normalizeNegativePrompt(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static Long parseSessionId(String value) {
        if (value == null) {
            return null;
        }
        try {
            long sessionId = Long.parseLong(value);
            if (sessionId <= 0 || !Long.toString(sessionId).equals(value)) {
                throw invalid("sessionId：必须是正整数 ID");
            }
            return sessionId;
        } catch (NumberFormatException exception) {
            throw invalid("sessionId：必须是正整数 ID");
        }
    }

    private static String defaultTitle(String prompt) {
        String title = prompt.strip();
        int maxEnd = title.offsetByCodePoints(0, Math.min(100,
                GenerationPromptComposer.codePointCount(title)));
        return title.substring(0, maxEnd);
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
            String idempotencyKey,
            String requestFingerprint) {
    }

    private record Dimension(int width, int height) {
    }
}
