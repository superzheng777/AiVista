package com.superz.aivista.search.service;

import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import java.time.Instant;

public final class SearchIndexOutboxEvent {
    private SearchIndexOutboxEvent() { }

    public static OutboxEvent create(long imageId, long publicationVersion, Instant now) {
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.PUBLICATION_SEARCH_INDEX_SYNC.name());
        event.setAggregateType("GENERATION_IMAGE");
        event.setAggregateId(imageId);
        event.setAggregateVersion(publicationVersion);
        event.setPayloadJson("{\"imageId\":\"" + imageId + "\"}");
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        return event;
    }
}
