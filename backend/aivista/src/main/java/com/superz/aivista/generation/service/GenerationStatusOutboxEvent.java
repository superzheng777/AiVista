package com.superz.aivista.generation.service;

import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import java.time.Instant;

/** Creates safe task-status SSE events on the generic Outbox schema. */
final class GenerationStatusOutboxEvent {
    private GenerationStatusOutboxEvent() {
    }

    static OutboxEvent create(long taskId, int taskVersion, String taskStatus,
            int modelRetryCount, Instant now) {
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.GENERATION_TASK_STATUS_CHANGED.name());
        event.setAggregateType("GENERATION_TASK");
        event.setAggregateId(taskId);
        event.setAggregateVersion((long) taskVersion);
        event.setPayloadJson("{\"status\":\"" + taskStatus + "\",\"modelRetryCount\":"
                + modelRetryCount + "}");
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        return event;
    }
}
