package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 取消当前用户尚未结束的生成任务。 */
@Service
public class GenerationTaskCancellationService {
    private static final ZoneId QUOTA_ZONE = ZoneId.of("Asia/Shanghai");

    private final GenerationTaskMapper taskMapper;
    private final UserGenerationDailyUsageMapper dailyUsageMapper;
    private final OutboxEventMapper outboxEventMapper;
    private final Clock clock;

    public GenerationTaskCancellationService(GenerationTaskMapper taskMapper,
            UserGenerationDailyUsageMapper dailyUsageMapper, OutboxEventMapper outboxEventMapper, Clock clock) {
        this.taskMapper = taskMapper;
        this.dailyUsageMapper = dailyUsageMapper;
        this.outboxEventMapper = outboxEventMapper;
        this.clock = clock;
    }

    /** 直接将活动任务变为 CANCELLED；重复取消为幂等成功。 */
    @Transactional
    public void cancel(long userId, long taskId) {
        GenerationTask task = taskMapper.selectOwnedByIdForUpdate(userId, taskId);
        if (task == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        if ("CANCELLED".equals(task.getStatus())) {
            return;
        }
        if (isFinished(task.getStatus())) {
            throw new BusinessException(ErrorCode.TASK_ALREADY_FINISHED);
        }
        if (!"QUEUED".equals(task.getStatus()) && !"RUNNING".equals(task.getStatus())) {
            throw new BusinessException(ErrorCode.TASK_ALREADY_FINISHED);
        }

        Instant now = clock.instant();
        Instant refundedAt = null;
        if (task.getProviderCallStartedAt() == null && task.getQuotaRefundedAt() == null) {
            LocalDate usageDate = LocalDate.ofInstant(task.getCreatedAt(), QUOTA_ZONE);
            if (dailyUsageMapper.refund(task.getUserId(), usageDate, task.getRequestedImageCount(), now) != 1) {
                throw new IllegalStateException("Generation quota refund record is missing for task " + taskId);
            }
            refundedAt = now;
        }
        if (taskMapper.cancelActive(task.getId(), task.getStatus(), task.getTaskVersion(), refundedAt, now) != 1) {
            throw new IllegalStateException("Cannot cancel generation task " + taskId);
        }
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.TASK_STATUS_CHANGED.name());
        event.setTaskId(task.getId());
        event.setTaskVersion(task.getTaskVersion() + 1);
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        outboxEventMapper.insertSelective(event);
    }

    private static boolean isFinished(String status) {
        return "SUCCEEDED".equals(status) || "PARTIALLY_SUCCEEDED".equals(status) || "FAILED".equals(status);
    }
}
