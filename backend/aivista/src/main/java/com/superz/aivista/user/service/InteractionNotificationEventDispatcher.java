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
        List<OutboxEvent> events = outboxEvents.selectAvailableByEventType(
                OutboxEventType.INTERACTION_NOTIFICATION_CREATED.name(), now, properties.dispatcherBatchSize());
        for (OutboxEvent event : events) {
            if (outboxEvents.claimPending(event.getId(), now, now) != 1) continue;
            try {
                JsonNode payload = objectMapper.readTree(event.getPayloadJson());
                if (!payload.hasNonNull("recipientUserId") || !payload.hasNonNull("notificationId")) {
                    throw new IllegalArgumentException("Invalid interaction notification payload");
                }
                connections.publish(payload.get("recipientUserId").asLong(), event.getId(),
                        new InteractionNotificationCreatedEvent(payload.get("notificationId").asText()));
                outboxEvents.markPublished(event.getId(), clock.instant());
            } catch (Exception exception) {
                outboxEvents.markFailed(event.getId(), "Invalid interaction notification payload");
            }
        }
    }
}
