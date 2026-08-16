package com.superz.aivista.search.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.search.client.MeilisearchAdminClient;
import com.superz.aivista.search.client.MeilisearchAdminException;
import com.superz.aivista.search.config.MeilisearchProperties;
import com.superz.aivista.search.model.SearchIndexDocument;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SearchIndexOutboxDispatcherTests {
    private static final Instant NOW = Instant.parse("2026-08-15T12:00:00Z");

    @Test
    void deduplicatesImagesAndCompletesMixedBatchAfterBothTasksSucceed() {
        Fixture fixture = fixture();
        List<OutboxEvent> events = List.of(event(9, 42, 0), event(10, 42, 0), event(11, 99, 0));
        available(fixture, events);
        when(fixture.images.selectPublishedByIds(List.of(42L, 99L))).thenReturn(List.of(publicImage(42)));
        when(fixture.client.upsertDocuments(eq("public_images"), any())).thenReturn(17L);
        when(fixture.client.deleteDocuments("public_images", List.of(99L))).thenReturn(18L);

        fixture.dispatcher.dispatch();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SearchIndexDocument>> documents = ArgumentCaptor.forClass(List.class);
        verify(fixture.client).upsertDocuments(eq("public_images"), documents.capture());
        assertThat(documents.getValue()).extracting(SearchIndexDocument::imageId).containsExactly(42L);
        verify(fixture.client).deleteDocuments("public_images", List.of(99L));
        verify(fixture.client).waitForTask(17L);
        verify(fixture.client).waitForTask(18L);
        verify(fixture.outbox).markPublishedBatch(List.of(9L, 10L, 11L), NOW);
    }

    @Test
    void processesOnlyEventsClaimedByThisDispatcher() {
        Fixture fixture = fixture();
        OutboxEvent claimed = event(9, 42, 0);
        OutboxEvent missed = event(10, 99, 0);
        when(fixture.outbox.selectAvailableByEventType(any(), eq(NOW), eq(100)))
                .thenReturn(List.of(claimed, missed));
        when(fixture.outbox.claimPending(9L, NOW, NOW)).thenReturn(1);
        when(fixture.outbox.claimPending(10L, NOW, NOW)).thenReturn(0);
        when(fixture.images.selectPublishedByIds(List.of(42L))).thenReturn(List.of(publicImage(42)));
        when(fixture.client.upsertDocuments(eq("public_images"), any())).thenReturn(17L);
        when(fixture.client.deleteDocuments("public_images", List.of())).thenReturn(-1L);

        fixture.dispatcher.dispatch();

        verify(fixture.images).selectPublishedByIds(List.of(42L));
        verify(fixture.outbox).markPublishedBatch(List.of(9L), NOW);
    }

    @Test
    void reschedulesWholeBatchUsingEachEventsRetryCount() {
        Fixture fixture = fixture();
        List<OutboxEvent> events = List.of(event(9, 42, 0), event(10, 99, 2));
        available(fixture, events);
        when(fixture.images.selectPublishedByIds(List.of(42L, 99L))).thenReturn(List.of(publicImage(42)));
        when(fixture.client.upsertDocuments(eq("public_images"), any())).thenThrow(
                new MeilisearchAdminException(MeilisearchAdminException.Kind.TRANSIENT, null, null));

        fixture.dispatcher.dispatch();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<OutboxEvent>> retried = ArgumentCaptor.forClass(List.class);
        verify(fixture.outbox).rescheduleBatch(retried.capture(), eq("TRANSIENT/unknown"));
        assertThat(retried.getValue()).extracting(OutboxEvent::getRetryCount).containsExactly(1, 3);
        assertThat(retried.getValue()).extracting(OutboxEvent::getAvailableAt)
                .containsExactly(NOW.plusSeconds(5), NOW.plusSeconds(120));
        verify(fixture.outbox, never()).markPublishedBatch(any(), any());
    }

    @Test
    void reschedulesWholeBatchWhenSecondMeilisearchTaskFails() {
        Fixture fixture = fixture();
        List<OutboxEvent> events = List.of(event(9, 42, 0), event(10, 99, 0));
        available(fixture, events);
        when(fixture.images.selectPublishedByIds(List.of(42L, 99L))).thenReturn(List.of(publicImage(42)));
        when(fixture.client.upsertDocuments(eq("public_images"), any())).thenReturn(17L);
        when(fixture.client.deleteDocuments("public_images", List.of(99L))).thenReturn(18L);
        doThrow(new MeilisearchAdminException(MeilisearchAdminException.Kind.TRANSIENT, null, null))
                .when(fixture.client).waitForTask(18L);

        fixture.dispatcher.dispatch();

        verify(fixture.client).waitForTask(17L);
        verify(fixture.client).waitForTask(18L);
        verify(fixture.outbox).rescheduleBatch(eq(events), eq("TRANSIENT/unknown"));
        verify(fixture.outbox, never()).markPublishedBatch(any(), any());
    }

    @Test
    void marksKnownInvalidBatchForManualAction() {
        Fixture fixture = fixture();
        OutboxEvent event = event(9, 42, 0);
        available(fixture, List.of(event));
        when(fixture.images.selectPublishedByIds(List.of(42L))).thenReturn(List.of(publicImage(42)));
        when(fixture.client.upsertDocuments(eq("public_images"), any())).thenThrow(
                new MeilisearchAdminException(MeilisearchAdminException.Kind.REQUIRES_ACTION,
                        "invalid_document_id", null));

        fixture.dispatcher.dispatch();

        verify(fixture.outbox).markFailedBatch(List.of(9L), "REQUIRES_ACTION/invalid_document_id");
    }

    @Test
    void recoversEventsOnlyAfterDerivedProcessingLease() {
        Fixture fixture = fixture();
        OutboxEvent expired = event(9, 42, 0);
        when(fixture.outbox.selectProcessingLockedBefore(any(), eq(NOW.minusSeconds(90)), eq(100)))
                .thenReturn(List.of(expired));

        fixture.dispatcher.dispatch();

        verify(fixture.outbox).rescheduleBatch(List.of(expired), "Search sync lease expired");
        assertThat(expired.getRetryCount()).isEqualTo(1);
        assertThat(expired.getAvailableAt()).isEqualTo(NOW.plusSeconds(5));
    }

    private static void available(Fixture fixture, List<OutboxEvent> events) {
        when(fixture.outbox.selectAvailableByEventType(any(), eq(NOW), eq(100))).thenReturn(events);
        for (OutboxEvent event : events) {
            when(fixture.outbox.claimPending(event.getId(), NOW, NOW)).thenReturn(1);
        }
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

    private static OutboxEvent event(long id, long imageId, int retryCount) {
        OutboxEvent event = new OutboxEvent();
        event.setId(id);
        event.setAggregateId(imageId);
        event.setRetryCount(retryCount);
        return event;
    }

    private static GenerationImage publicImage(long imageId) {
        GenerationImage image = new GenerationImage();
        image.setId(imageId);
        image.setPublicationTitle("AI 星空");
        image.setPublicationPrompt("blue stars");
        image.setLikeCount(3L);
        image.setPublicAt(NOW);
        return image;
    }

    private record Fixture(SearchIndexOutboxDispatcher dispatcher, MeilisearchAdminClient client,
                           GenerationImageMapper images, OutboxEventMapper outbox) { }
}
