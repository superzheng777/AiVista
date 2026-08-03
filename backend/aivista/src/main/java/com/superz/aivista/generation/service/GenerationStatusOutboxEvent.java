package com.superz.aivista.generation.service;

import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import java.time.Instant;

/** 创建包含状态发生时快照的任务状态 Outbox 事件。 */
final class GenerationStatusOutboxEvent {
    private GenerationStatusOutboxEvent() {
    }

    static OutboxEvent create(long taskId, int taskVersion, String taskStatus,
            int modelRetryCount, Instant now) {
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.TASK_STATUS_CHANGED.name());
        event.setTaskId(taskId);
        event.setTaskVersion(taskVersion);
        event.setTaskStatus(taskStatus);
        event.setModelRetryCount(modelRetryCount);
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        return event;
    }
}
