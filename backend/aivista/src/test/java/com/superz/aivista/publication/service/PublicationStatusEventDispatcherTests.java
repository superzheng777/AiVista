package com.superz.aivista.publication.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.config.GenerationSseProperties;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.service.GenerationSseConnectionService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class PublicationStatusEventDispatcherTests {
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");

    @Test
    void readsImagesAndPublishesEventsInBatches() {
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        OutboxEvent first = event(11L, 301L);
        OutboxEvent second = event(12L, 302L);
        when(outbox.selectAvailableByEventType("PUBLICATION_STATUS_CHANGED", NOW, 100))
                .thenReturn(List.of(first, second));
        when(outbox.claimPending(11L, NOW, NOW)).thenReturn(1);
        when(outbox.claimPending(12L, NOW, NOW)).thenReturn(1);
        when(images.selectByImageIds(List.of(301L, 302L))).thenReturn(List.of(image(301L), image(302L)));

        dispatcher(outbox, images).dispatchAvailableEvents();

        verify(outbox).markPublishedBatch(List.of(11L, 12L), NOW);
    }

    @Test
    void requeuesExpiredEventsInOneBatch() {
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        OutboxEvent stale = event(11L, 301L);
        stale.setRetryCount(2);
        when(outbox.selectProcessingLockedBefore("PUBLICATION_STATUS_CHANGED", NOW.minusSeconds(30), 100))
                .thenReturn(List.of(stale));

        dispatcher(outbox, mock(GenerationImageMapper.class)).dispatchAvailableEvents();

        verify(outbox).rescheduleBatch(List.of(stale), "SSE publication event processing lease expired");
        org.assertj.core.api.Assertions.assertThat(stale.getRetryCount()).isEqualTo(3);
        org.assertj.core.api.Assertions.assertThat(stale.getAvailableAt()).isEqualTo(NOW);
    }

    private static PublicationStatusEventDispatcher dispatcher(OutboxEventMapper outbox, GenerationImageMapper images) {
        return new PublicationStatusEventDispatcher(outbox, images, mock(GenerationSseConnectionService.class), properties(),
                new ObjectMapper(), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationSseProperties properties() {
        return new GenerationSseProperties(3, 1000, Duration.ofSeconds(15), Duration.ofSeconds(1), 100,
                Duration.ofSeconds(30));
    }

    private static OutboxEvent event(long id, long imageId) {
        OutboxEvent event = new OutboxEvent();
        event.setId(id);
        event.setAggregateId(imageId);
        event.setAggregateVersion(1L);
        event.setPayloadJson("{\"status\":\"APPROVED\"}");
        return event;
    }

    private static GenerationImage image(long id) {
        GenerationImage image = new GenerationImage();
        image.setId(id);
        image.setUserId(7L);
        return image;
    }
}
