package com.superz.aivista.generation.service;

import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.GenerationFailureCode;
import com.superz.aivista.generation.model.GenerationTaskStatus;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 将转存消息无法投递、持续消费失败或等待超时安全收敛为不返额度的任务失败。 */
@Service
public class GenerationImageTransferFailureService {
    private final GenerationTaskMapper taskMapper;
    private final OutboxEventMapper outboxEventMapper;

    public GenerationImageTransferFailureService(GenerationTaskMapper taskMapper,
            OutboxEventMapper outboxEventMapper) {
        this.taskMapper = taskMapper;
        this.outboxEventMapper = outboxEventMapper;
    }

    @Transactional
    public void failDelivery(long eventId, long taskId, int taskVersion, Instant now, String error) {
        if (outboxEventMapper.markFailed(eventId, error) == 1) {
            failIfStillWaiting(taskId, taskVersion, now);
        }
    }

    @Transactional
    public boolean failConsumption(long taskId, int taskVersion, Instant now) {
        return failIfStillTransferring(taskId, taskVersion, false, now);
    }

    @Transactional
    public boolean failWaitingTimeout(long taskId, int taskVersion, Instant now) {
        return failIfStillTransferring(taskId, taskVersion, true, now);
    }

    private boolean failIfStillWaiting(long taskId, int taskVersion, Instant now) {
        return failIfStillTransferring(taskId, taskVersion, true, now);
    }

    private boolean failIfStillTransferring(long taskId, int taskVersion, boolean requireNotStarted, Instant now) {
        GenerationTask task = taskMapper.selectByIdForUpdate(taskId);
        if (task == null || !GenerationTaskStatus.TRANSFERRING.name().equals(task.getStatus())
                || task.getTaskVersion() != taskVersion
                || (requireNotStarted && task.getTransferStartedAt() != null)
                || taskMapper.failTransferring(taskId, taskVersion,
                        GenerationFailureCode.IMAGE_TRANSFER_FAILED.name(), now) != 1) {
            return false;
        }
        outboxEventMapper.insertSelective(GenerationStatusOutboxEvent.create(
                task.getId(), task.getTaskVersion() + 1, GenerationTaskStatus.FAILED.name(),
                task.getAttemptCount() == null ? 0 : task.getAttemptCount(), now));
        return true;
    }
}
