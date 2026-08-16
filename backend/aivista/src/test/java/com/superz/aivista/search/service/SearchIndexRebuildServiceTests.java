package com.superz.aivista.search.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.search.client.MeilisearchAdminClient;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.List;
import org.junit.jupiter.api.Test;

class SearchIndexRebuildServiceTests {

    @Test
    void catchUpDeduplicatesChangedImagesAndUsesBatchSynchronization() {
        MeilisearchProperties properties = properties();
        MeilisearchAdminClient client = mock(MeilisearchAdminClient.class);
        SearchIndexInitializer initializer = mock(SearchIndexInitializer.class);
        SearchIndexOutboxDispatcher dispatcher = mock(SearchIndexOutboxDispatcher.class);
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        SearchIndexRebuildService service = new SearchIndexRebuildService(properties, client, initializer,
                dispatcher, outbox, Clock.systemUTC(), null);
        when(outbox.selectMaxId()).thenReturn(13L);
        when(outbox.selectByEventTypeAndIdRange(
                OutboxEventType.PUBLICATION_SEARCH_INDEX_SYNC.name(), 10L, 13L, 100))
                .thenReturn(List.of(event(11, 42), event(12, 42), event(13, 99)));
        when(client.swapIndexes("public_images", "public_images_rebuild")).thenReturn(21L);

        service.catchUpAndSwap("public_images_rebuild", 10L);

        verify(dispatcher).syncImagesTo("public_images_rebuild", new LinkedHashSet<>(List.of(42L, 99L)));
        verify(client).waitForTask(21L);
    }

    private static OutboxEvent event(long eventId, long imageId) {
        OutboxEvent event = new OutboxEvent();
        event.setId(eventId);
        event.setAggregateId(imageId);
        return event;
    }

    private static MeilisearchProperties properties() {
        return new MeilisearchProperties(true, "http://meili.test", "search", "admin", "public_images",
                Duration.ofSeconds(1), Duration.ofSeconds(2), Duration.ofSeconds(2), Duration.ofSeconds(5),
                Duration.ofSeconds(30), 100, false, false);
    }
}
