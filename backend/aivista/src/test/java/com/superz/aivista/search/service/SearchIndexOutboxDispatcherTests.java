package com.superz.aivista.search.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.search.client.MeilisearchAdminClient;
import com.superz.aivista.search.client.MeilisearchAdminException;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class SearchIndexOutboxDispatcherTests {
    private static final Instant NOW = Instant.parse("2026-08-15T12:00:00Z");

    @Test
    void rereadsCurrentMysqlProjectionAndMarksEventPublished() {
        Fixture fixture = fixture();
        OutboxEvent event = event();
        when(fixture.outbox.selectAvailableByEventType(any(), eq(NOW), eq(100))).thenReturn(List.of(event));
        when(fixture.outbox.claimPending(9L, NOW, NOW)).thenReturn(1);
        when(fixture.images.selectPublishedById(42L)).thenReturn(publicImage());
        when(fixture.client.upsertDocuments(eq("public_images"), any())).thenReturn(17L);

        fixture.dispatcher.dispatch();

        verify(fixture.client).waitForTask(17L);
        verify(fixture.outbox).markPublished(9L, NOW);
    }

    @Test
    void marksKnownInvalidRequestForManualAction() {
        Fixture fixture = fixture();
        OutboxEvent event = event();
        when(fixture.outbox.selectAvailableByEventType(any(), eq(NOW), eq(100))).thenReturn(List.of(event));
        when(fixture.outbox.claimPending(9L, NOW, NOW)).thenReturn(1);
        when(fixture.images.selectPublishedById(42L)).thenReturn(publicImage());
        when(fixture.client.upsertDocuments(eq("public_images"), any())).thenThrow(
                new MeilisearchAdminException(MeilisearchAdminException.Kind.REQUIRES_ACTION,
                        "invalid_document_id", null));

        fixture.dispatcher.dispatch();

        verify(fixture.outbox).markFailed(9L, "REQUIRES_ACTION/invalid_document_id");
    }

    private static Fixture fixture() {
        MeilisearchProperties properties = new MeilisearchProperties(true, "http://meili.test", "search", "admin",
                "public_images", Duration.ofSeconds(1), Duration.ofSeconds(2), Duration.ofSeconds(2),
                Duration.ofSeconds(5), Duration.ofSeconds(30), 100, false, false);
        SearchIndexInitializer initializer = mock(SearchIndexInitializer.class);
        MeilisearchAdminClient client = mock(MeilisearchAdminClient.class);
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        when(initializer.ready()).thenReturn(true);
        SearchIndexOutboxDispatcher dispatcher = new SearchIndexOutboxDispatcher(properties, initializer, client,
                images, outbox, Clock.fixed(NOW, ZoneOffset.UTC));
        return new Fixture(dispatcher, client, images, outbox);
    }

    private static OutboxEvent event() {
        OutboxEvent event = new OutboxEvent();
        event.setId(9L);
        event.setAggregateId(42L);
        event.setRetryCount(0);
        return event;
    }

    private static GenerationImage publicImage() {
        GenerationImage image = new GenerationImage();
        image.setId(42L);
        image.setPublicationTitle("AI 星空");
        image.setPublicationPrompt("blue stars");
        image.setLikeCount(3L);
        image.setPublicAt(NOW);
        return image;
    }

    private record Fixture(SearchIndexOutboxDispatcher dispatcher, MeilisearchAdminClient client,
                           GenerationImageMapper images, OutboxEventMapper outbox) { }
}
