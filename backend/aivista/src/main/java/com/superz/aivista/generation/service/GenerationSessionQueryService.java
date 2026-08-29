package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationSessionLatestTaskResponse;
import com.superz.aivista.generation.dto.GenerationSessionPageResponse;
import com.superz.aivista.generation.dto.GenerationSessionSummaryResponse;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 按稳定游标分页读取当前用户已有内容的生成会话。 */
@Service
public class GenerationSessionQueryService {
    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 50;

    private final GenerationSessionMapper sessionMapper;
    private final GenerationTaskMapper taskMapper;

    /**
     * 注入会话分页查询器和最新任务批量查询器。
     *
     * @param sessionMapper 按用户及游标读取会话的 Mapper
     * @param taskMapper 批量读取会话最新任务的 Mapper
     */
    public GenerationSessionQueryService(GenerationSessionMapper sessionMapper, GenerationTaskMapper taskMapper) {
        this.sessionMapper = sessionMapper;
        this.taskMapper = taskMapper;
    }

    /**
     * 返回当前用户的会话侧栏摘要。
     *
     * <p>查询会额外读取一条记录以判断是否还有下一页，并批量加载当前页各会话的最新任务和活动状态，避免逐会话查询。
     * 返回的游标只由最后一项的 {@code lastMessageAt} 和会话 ID 构成，因此能在同一排序规则下稳定继续分页。</p>
     *
     * @param userId 当前已认证用户 ID
     * @param cursor 上一页返回的游标；首次查询传 {@code null}
     * @param requestedLimit 客户端请求页大小；未传时使用默认值
     * @return 当前页会话摘要、下一页游标与是否还有更多数据
     */
    @Transactional(readOnly = true)
    public GenerationSessionPageResponse list(long userId, String cursor, Integer requestedLimit) {
        int limit = normalizeLimit(requestedLimit);
        Cursor position = decodeCursor(cursor);
        List<GenerationSession> page = sessionMapper.selectPageByUserId(
                userId, position == null ? null : position.lastMessageAt(),
                position == null ? null : position.sessionId(), limit + 1);
        boolean hasMore = page.size() > limit;
        List<GenerationSession> sessions = hasMore ? page.subList(0, limit) : page;
        Map<Long, GenerationTask> latestTasks = sessions.isEmpty() ? Map.of()
                : taskMapper.selectLatestBySessionIds(sessions.stream().map(GenerationSession::getId).toList()).stream()
                        .collect(java.util.stream.Collectors.toMap(GenerationTask::getSessionId, Function.identity()));
        java.util.Set<Long> activeSessionIds = sessions.isEmpty() ? java.util.Set.of()
                : new HashSet<>(taskMapper.selectActiveSessionIds(
                        sessions.stream().map(GenerationSession::getId).toList()));
        List<GenerationSessionSummaryResponse> items = sessions.stream()
                .map(session -> summary(session, latestTasks.get(session.getId()), activeSessionIds.contains(session.getId())))
                .toList();
        String nextCursor = hasMore ? encodeCursor(sessions.getLast()) : null;
        return new GenerationSessionPageResponse(items, nextCursor, hasMore);
    }

    /**
     * 解析并校验页大小，避免不受限制的列表查询。
     *
     * @param requestedLimit 客户端传入的页大小，可为空
     * @return 位于 1 到 50 之间的有效页大小
     * @throws BusinessException 页大小超出允许范围时抛出参数校验错误
     */
    private static int normalizeLimit(Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "limit 必须在 1 到 50 之间");
        }
        return limit;
    }

    /**
     * 将持久化会话及其可选的最新任务转换为侧栏使用的最小响应模型。
     *
     * @param session 当前页中的会话记录
     * @param latestTask 当前会话最近一次提交所关联的任务；无任务时为 {@code null}
     * @return 不包含提示词、模型参数和图片地址的会话摘要
     */
    private static GenerationSessionSummaryResponse summary(GenerationSession session, GenerationTask latestTask,
            boolean hasActiveTask) {
        GenerationSessionLatestTaskResponse task = latestTask == null ? null
                : new GenerationSessionLatestTaskResponse(String.valueOf(latestTask.getId()), latestTask.getStatus(),
                        latestTask.getTaskVersion());
        return new GenerationSessionSummaryResponse(String.valueOf(session.getId()), session.getTitle(),
                session.getLastMessageAt(), task, hasActiveTask);
    }

    /**
     * 将会话排序边界编码为 URL 安全的无填充 Base64 游标。
     *
     * <p>游标不是资源 ID，也不应由客户端拼接；客户端只需原样传回。服务端仍以当前用户 ID 约束数据库查询，
     * 因此游标不能越权读取其他用户的会话。</p>
     *
     * @param session 当前页最后一个会话
     * @return 可用于获取下一页的游标
     */
    private static String encodeCursor(GenerationSession session) {
        String value = session.getLastMessageAt().toEpochMilli() + ":" + session.getId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 解析客户端原样传回的游标并恢复数据库排序边界。
     *
     * @param cursor URL 安全 Base64 编码的“毫秒时间戳:会话 ID”；首次查询传 {@code null}
     * @return 解析后的排序边界；首次查询返回 {@code null}
     * @throws BusinessException 游标缺少字段、格式损坏或包含非法会话 ID 时抛出无效游标错误
     */
    private static Cursor decodeCursor(String cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            String value = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] parts = value.split(":", -1);
            if (parts.length != 2) {
                throw new IllegalArgumentException("Invalid cursor structure");
            }
            long epochMillis = Long.parseLong(parts[0]);
            long sessionId = Long.parseLong(parts[1]);
            if (sessionId <= 0) {
                throw new IllegalArgumentException("Invalid session id");
            }
            return new Cursor(Instant.ofEpochMilli(epochMillis), sessionId);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_CURSOR);
        }
    }

    /** 供 Mapper 查询使用的游标排序边界，顺序与 {@code last_message_at DESC, id DESC} 一致。 */
    private record Cursor(Instant lastMessageAt, long sessionId) {
    }
}
