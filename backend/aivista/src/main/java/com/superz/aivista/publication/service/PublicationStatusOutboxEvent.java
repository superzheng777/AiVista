package com.superz.aivista.publication.service;

import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import java.time.Instant;

/** Creates publication SSE events on the shared reliable Outbox. */
final class PublicationStatusOutboxEvent {
    private PublicationStatusOutboxEvent() {
    }

    static OutboxEvent create(long imageId, long version, String status, Instant now) {
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.PUBLICATION_STATUS_CHANGED.name());
        event.setAggregateType("GENERATION_IMAGE");
        event.setAggregateId(imageId);
        event.setAggregateVersion(version);
        event.setPayloadJson("{\"status\":\"" + status + "\"}");
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        return event;
    }
}
