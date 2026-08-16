package com.superz.aivista.search.service;

import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.search.client.MeilisearchAdminClient;
import com.superz.aivista.search.client.MeilisearchAdminException;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class SearchIndexOutboxDispatcher {
    private static final Logger log = LoggerFactory.getLogger(SearchIndexOutboxDispatcher.class);
    private static final Duration LEASE = Duration.ofMinutes(1);
    private static final long[] RETRY_SECONDS = {5, 30, 120, 300};
    private final MeilisearchProperties properties;
    private final SearchIndexInitializer initializer;
    private final MeilisearchAdminClient client;
    private final GenerationImageMapper images;
    private final OutboxEventMapper outbox;
    private final Clock clock;
    private boolean paused;

    public SearchIndexOutboxDispatcher(MeilisearchProperties properties, SearchIndexInitializer initializer,
            MeilisearchAdminClient client, GenerationImageMapper images, OutboxEventMapper outbox, Clock clock) {
        this.properties = properties;
        this.initializer = initializer;
        this.client = client;
        this.images = images;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Scheduled(initialDelay = 6_000, fixedDelay = 1_000)
    public synchronized void dispatch() {
        if (paused || !initializer.ready()) return;
        Instant now = clock.instant();
        recoverExpired(now);
        List<OutboxEvent> events = outbox.selectAvailableByEventType(
                OutboxEventType.PUBLICATION_SEARCH_INDEX_SYNC.name(), now, properties.syncBatchSize());
        for (OutboxEvent event : events) {
            if (outbox.claimPending(event.getId(), now, now) == 1) process(event);
        }
    }

    public synchronized void runPaused(Runnable operation) {
        paused = true;
        try {
            operation.run();
        } finally {
            paused = false;
        }
    }

    void syncImageTo(String indexUid, long imageId) {
        GenerationImage image = images.selectPublishedById(imageId);
        long taskUid = image == null
                ? client.deleteDocument(indexUid, imageId)
                : client.upsertDocuments(indexUid, List.of(SearchIndexProjectionMapper.toDocument(image)));
        client.waitForTask(taskUid);
    }

    private void process(OutboxEvent event) {
        try {
            syncImageTo(properties.indexUid(), event.getAggregateId());
            outbox.markPublished(event.getId(), clock.instant());
        } catch (MeilisearchAdminException exception) {
            if (exception.kind() == MeilisearchAdminException.Kind.REQUIRES_ACTION) {
                outbox.markFailed(event.getId(), safeError(exception));
                log.error("Search index event requires action: outboxId={}, imageId={}, reason={}",
                        event.getId(), event.getAggregateId(), safeError(exception));
            } else {
                if (exception.kind() == MeilisearchAdminException.Kind.INDEX_NOT_FOUND) initializer.markUnavailable();
                reschedule(event, safeError(exception));
            }
        } catch (Exception exception) {
            reschedule(event, exception.getClass().getSimpleName());
        }
    }

    private void recoverExpired(Instant now) {
        for (OutboxEvent event : outbox.selectProcessingLockedBefore(
                OutboxEventType.PUBLICATION_SEARCH_INDEX_SYNC.name(), now.minus(LEASE), properties.syncBatchSize())) {
            int retry = nextRetryCount(event.getRetryCount());
            outbox.reschedule(event.getId(), retry, now.plusSeconds(delaySeconds(retry)), "Search sync lease expired");
        }
    }

    private void reschedule(OutboxEvent event, String reason) {
        int retry = nextRetryCount(event.getRetryCount());
        outbox.reschedule(event.getId(), retry, clock.instant().plusSeconds(delaySeconds(retry)), reason);
    }

    private static int nextRetryCount(int retryCount) {
        return retryCount == Integer.MAX_VALUE ? Integer.MAX_VALUE : retryCount + 1;
    }

    private static long delaySeconds(int retryCount) {
        return RETRY_SECONDS[Math.min(Math.max(1, retryCount), RETRY_SECONDS.length) - 1];
    }

    private static String safeError(MeilisearchAdminException exception) {
        return exception.kind() + "/" + (exception.errorCode() == null ? "unknown" : exception.errorCode());
    }
}
