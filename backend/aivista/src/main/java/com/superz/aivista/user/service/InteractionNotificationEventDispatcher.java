package com.superz.aivista.user.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.config.GenerationSseProperties;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.service.GenerationSseConnectionService;
import com.superz.aivista.user.event.InteractionNotificationCreatedEvent;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class InteractionNotificationEventDispatcher {
    private final OutboxEventMapper outboxEvents;
    private final GenerationSseConnectionService connections;
    private final GenerationSseProperties properties;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    public InteractionNotificationEventDispatcher(OutboxEventMapper outboxEvents, GenerationSseConnectionService connections,
            GenerationSseProperties properties, Clock clock, ObjectMapper objectMapper) {
        this.outboxEvents = outboxEvents;
        this.connections = connections;
        this.properties = properties;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedDelayString = "${app.generation.sse.dispatcher-fixed-delay}")
    public void dispatchAvailableEvents() {
        Instant now = clock.instant();
        recoverExpiredProcessingEvents(now);
        List<OutboxEvent> events = outboxEvents.selectAvailableByEventType(
                OutboxEventType.INTERACTION_NOTIFICATION_CREATED.name(), now, properties.dispatcherBatchSize());
        List<OutboxEvent> claimed = events.stream()
                .filter(event -> outboxEvents.claimPending(event.getId(), now, now) == 1)
                .toList();
        List<Long> publishedIds = new ArrayList<>();
        List<Long> failedIds = new ArrayList<>();
        for (OutboxEvent event : claimed) {
            try {
                JsonNode payload = objectMapper.readTree(event.getPayloadJson());
                if (!payload.hasNonNull("recipientUserId") || !payload.hasNonNull("notificationId")) {
                    throw new IllegalArgumentException("Invalid interaction notification payload");
                }
                connections.publish(payload.get("recipientUserId").asLong(), event.getId(),
                        new InteractionNotificationCreatedEvent(payload.get("notificationId").asText()));
                publishedIds.add(event.getId());
            } catch (Exception exception) {
                failedIds.add(event.getId());
            }
        }
        if (!failedIds.isEmpty()) {
            outboxEvents.markFailedBatch(failedIds, "Invalid interaction notification payload");
        }
        if (!publishedIds.isEmpty()) {
            outboxEvents.markPublishedBatch(publishedIds, clock.instant());
        }
    }

    private void recoverExpiredProcessingEvents(Instant now) {
        List<OutboxEvent> events = outboxEvents.selectProcessingLockedBefore(
                OutboxEventType.INTERACTION_NOTIFICATION_CREATED.name(), now.minus(properties.processingLease()),
                properties.dispatcherBatchSize());
        if (!events.isEmpty()) {
            events.forEach(event -> {
                event.setRetryCount(event.getRetryCount() + 1);
                event.setAvailableAt(now);
            });
            outboxEvents.rescheduleBatch(events, "SSE interaction notification processing lease expired");
        }
    }
}
