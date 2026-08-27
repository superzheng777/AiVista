package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationMessageItemResponse;
import com.superz.aivista.generation.dto.GenerationMessagePageResponse;
import com.superz.aivista.generation.dto.GenerationMessageResponse;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.entity.GenerationMessage;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.GenerationMessageMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 查询当前用户某个生成会话的历史消息。 */
@Service
public class GenerationSessionMessageQueryService {
    private static final int DEFAULT_LIMIT = 5;
    private static final int MAX_LIMIT = 5;

    private final GenerationSessionMapper sessionMapper;
    private final GenerationMessageMapper messageMapper;
    private final GenerationTaskMapper taskMapper;
    private final ImageAssetMapper imageAssetMapper;
    private final GenerationTaskQueryService taskQueryService;

    /**
     * 注入会话归属校验、消息与任务批量查询，以及负责生成任务安全快照的服务。
     */
    public GenerationSessionMessageQueryService(GenerationSessionMapper sessionMapper,
            GenerationMessageMapper messageMapper, GenerationTaskMapper taskMapper,
            ImageAssetMapper imageAssetMapper, GenerationTaskQueryService taskQueryService) {
        this.sessionMapper = sessionMapper;
        this.messageMapper = messageMapper;
        this.taskMapper = taskMapper;
        this.imageAssetMapper = imageAssetMapper;
        this.taskQueryService = taskQueryService;
    }

    /**
     * 查询会话的历史消息。数据库按最新消息倒序读取，响应前再反转为适合聊天界面展示的时间正序。
     */
    @Transactional(readOnly = true)
    public GenerationMessagePageResponse list(long userId, long sessionId, String before, Integer requestedLimit) {
        if (sessionMapper.selectOwnedById(sessionId, userId) == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }

        int limit = normalizeLimit(requestedLimit);
        Integer beforeSequenceNo = decodeCursor(before);
        List<GenerationMessage> newestFirst = messageMapper.selectPageBySessionId(sessionId, beforeSequenceNo, limit + 1);
        boolean hasMore = newestFirst.size() > limit;
        List<GenerationMessage> page = new ArrayList<>(newestFirst.subList(0, Math.min(limit, newestFirst.size())));
        String nextBefore = hasMore ? encodeCursor(page.getLast().getSequenceNo()) : null;
        Collections.reverse(page);
        return new GenerationMessagePageResponse(toItems(page), nextBefore, hasMore);
    }

    /** 将页面中所有消息关联的任务和图片分批读取，避免逐条查询造成 N+1 问题。 */
    private List<GenerationMessageItemResponse> toItems(List<GenerationMessage> messages) {
        if (messages.isEmpty()) {
            return List.of();
        }
        List<Long> messageIds = messages.stream().map(GenerationMessage::getId).toList();
        Map<Long, GenerationTask> tasksByMessageId = taskMapper.selectBySourceMessageIds(messageIds).stream()
                .collect(Collectors.toMap(GenerationTask::getSourceMessageId, Function.identity()));
        Map<Long, List<ImageAsset>> imagesByTaskId = imagesByTaskId(tasksByMessageId.values());
        return messages.stream()
                .map(message -> toItem(message, tasksByMessageId.get(message.getId()), imagesByTaskId))
                .toList();
    }

    /** 批量读取任务图片，并按任务 ID 分组，供任务快照复用。 */
    private Map<Long, List<ImageAsset>> imagesByTaskId(Iterable<GenerationTask> tasks) {
        List<Long> taskIds = new ArrayList<>();
        for (GenerationTask task : tasks) {
            taskIds.add(task.getId());
        }
        if (taskIds.isEmpty()) {
            return Map.of();
        }
        return imageAssetMapper.selectByOriginTaskIds(taskIds).stream()
                .collect(Collectors.groupingBy(ImageAsset::getOriginTaskId));
    }

    /** 组装单条消息和其任务快照；异常历史数据缺少任务时仍返回消息本身。 */
    private GenerationMessageItemResponse toItem(GenerationMessage message, GenerationTask task,
            Map<Long, List<ImageAsset>> imagesByTaskId) {
        GenerationMessageResponse messageResponse = new GenerationMessageResponse(
                String.valueOf(message.getId()), message.getSequenceNo(), message.getPrompt(),
                message.getNegativePrompt(), message.getCreatedAt());
        return new GenerationMessageItemResponse(messageResponse,
                task == null ? null : taskQueryService.snapshot(task, imagesByTaskId.getOrDefault(task.getId(), List.of())));
    }

    /** 规范化分页大小，缺省取 30，允许范围为 1 至 100。 */
    private int normalizeLimit(Integer requestedLimit) {
        if (requestedLimit == null) {
            return DEFAULT_LIMIT;
        }
        if (requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR);
        }
        return requestedLimit;
    }

    /** 将当前页最旧消息的序号编码为 URL 安全的透明游标。 */
    private String encodeCursor(int sequenceNo) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(String.valueOf(sequenceNo).getBytes(StandardCharsets.UTF_8));
    }

    /** 解码前端回传的游标；格式错误或非正序号统一视为无效请求。 */
    private Integer decodeCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }
        try {
            int sequenceNo = Integer.parseInt(new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8));
            if (sequenceNo < 1) {
                throw new NumberFormatException();
            }
            return sequenceNo;
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_CURSOR);
        }
    }
}
