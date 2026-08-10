package com.superz.aivista.publication.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.config.GenerationSseProperties;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.service.GenerationSseConnectionService;
import com.superz.aivista.publication.event.PublicationStatusEvent;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Delivers final publication states to a user's existing authenticated SSE stream. */
@Service
public class PublicationStatusEventDispatcher {
    private final OutboxEventMapper outbox;
    private final GenerationImageMapper images;
    private final GenerationSseConnectionService connections;
    private final GenerationSseProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public PublicationStatusEventDispatcher(OutboxEventMapper outbox, GenerationImageMapper images,
            GenerationSseConnectionService connections, GenerationSseProperties properties,
            ObjectMapper objectMapper, Clock clock) {
        this.outbox = outbox;
        this.images = images;
        this.connections = connections;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.generation.sse.dispatcher-fixed-delay}")
    public void dispatchAvailableEvents() {
        Instant now = clock.instant();
        List<OutboxEvent> events = outbox.selectAvailableByEventType(
                OutboxEventType.PUBLICATION_STATUS_CHANGED.name(), now, properties.dispatcherBatchSize());
        for (OutboxEvent event : events) {
            if (outbox.claimPending(event.getId(), now, now) != 1) {
                continue;
            }
            publish(event);
        }
    }

    private void publish(OutboxEvent event) {
        try {
            JsonNode payload = objectMapper.readTree(event.getPayloadJson());
            GenerationImage image = images.selectByImageId(event.getAggregateId());
            if (image != null && payload.hasNonNull("status")) {
                connections.publish(image.getUserId(), event.getId(), new PublicationStatusEvent(
                        String.valueOf(image.getId()), event.getAggregateVersion(), payload.get("status").asText(),
                        image.getPublicAt()));
            }
            outbox.markPublished(event.getId(), clock.instant());
        } catch (Exception exception) {
            outbox.markFailed(event.getId(), "Invalid publication status event payload");
        }
    }
}
