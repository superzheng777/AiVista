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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
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
        recoverExpiredProcessingEvents(now);
        List<OutboxEvent> events = outbox.selectAvailableByEventType(
                OutboxEventType.PUBLICATION_STATUS_CHANGED.name(), now, properties.dispatcherBatchSize());
        List<OutboxEvent> claimed = events.stream()
                .filter(event -> outbox.claimPending(event.getId(), now, now) == 1)
                .toList();
        if (claimed.isEmpty()) {
            return;
        }
        Map<Long, GenerationImage> imagesById = images.selectByImageIds(
                claimed.stream().map(OutboxEvent::getAggregateId).distinct().toList()).stream()
                .collect(Collectors.toMap(GenerationImage::getId, Function.identity()));
        List<Long> publishedIds = new ArrayList<>();
        List<Long> failedIds = new ArrayList<>();
        for (OutboxEvent event : claimed) {
            publish(event, imagesById.get(event.getAggregateId()), publishedIds, failedIds);
        }
        if (!failedIds.isEmpty()) {
            outbox.markFailedBatch(failedIds, "Invalid publication status event payload");
        }
        if (!publishedIds.isEmpty()) {
            outbox.markPublishedBatch(publishedIds, clock.instant());
        }
    }

    private void publish(OutboxEvent event, GenerationImage image, List<Long> publishedIds, List<Long> failedIds) {
        try {
            JsonNode payload = objectMapper.readTree(event.getPayloadJson());
            if (image != null && payload.hasNonNull("status")) {
                connections.publish(image.getUserId(), event.getId(), new PublicationStatusEvent(
                        String.valueOf(image.getId()), event.getAggregateVersion(), payload.get("status").asText(),
                        image.getPublicAt()));
            }
            publishedIds.add(event.getId());
        } catch (Exception exception) {
            failedIds.add(event.getId());
        }
    }

    private void recoverExpiredProcessingEvents(Instant now) {
        List<OutboxEvent> events = outbox.selectProcessingLockedBefore(
                OutboxEventType.PUBLICATION_STATUS_CHANGED.name(), now.minus(properties.processingLease()),
                properties.dispatcherBatchSize());
        if (!events.isEmpty()) {
            events.forEach(event -> {
                event.setRetryCount(event.getRetryCount() + 1);
                event.setAvailableAt(now);
            });
            outbox.rescheduleBatch(events, "SSE publication event processing lease expired");
        }
    }
}
