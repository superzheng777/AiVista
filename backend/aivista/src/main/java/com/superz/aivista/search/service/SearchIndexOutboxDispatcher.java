package com.superz.aivista.search.service;

import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.search.client.MeilisearchAdminClient;
import com.superz.aivista.search.client.MeilisearchAdminException;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class SearchIndexOutboxDispatcher {
    private static final Logger log = LoggerFactory.getLogger(SearchIndexOutboxDispatcher.class);
    private static final Duration MINIMUM_LEASE = Duration.ofSeconds(90);
    private static final long[] RETRY_SECONDS = {5, 30, 120, 300};
    private final MeilisearchProperties properties;
    private final SearchIndexInitializer initializer;
    private final MeilisearchAdminClient client;
    private final ImageAssetMapper images;
    private final OutboxEventMapper outbox;
    private final Clock clock;
    private boolean paused;

    public SearchIndexOutboxDispatcher(MeilisearchProperties properties, SearchIndexInitializer initializer,
            MeilisearchAdminClient client, ImageAssetMapper images, OutboxEventMapper outbox, Clock clock) {
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
        List<OutboxEvent> claimed = new ArrayList<>(events.size());
        for (OutboxEvent event : events) {
            if (outbox.claimPending(event.getId(), now, now) == 1) claimed.add(event);
        }
        if (!claimed.isEmpty()) process(claimed);
    }

    public synchronized void runPaused(Runnable operation) {
        paused = true;
        try {
            operation.run();
        } finally {
            paused = false;
        }
    }

    void syncImagesTo(String indexUid, Collection<Long> requestedImageIds) {
        List<Long> imageIds = new ArrayList<>(new LinkedHashSet<>(requestedImageIds));
        if (imageIds.isEmpty()) return;
        List<ImageAsset> published = images.selectPublishedByIds(imageIds);
        Set<Long> publishedIds = new LinkedHashSet<>();
        for (ImageAsset image : published) publishedIds.add(image.getId());
        List<Long> deletedIds = imageIds.stream().filter(imageId -> !publishedIds.contains(imageId)).toList();
        long upsertTaskUid = client.upsertDocuments(indexUid,
                published.stream().map(SearchIndexProjectionMapper::toDocument).toList());
        long deleteTaskUid = client.deleteDocuments(indexUid, deletedIds);
        client.waitForTask(upsertTaskUid);
        client.waitForTask(deleteTaskUid);
    }

    private void process(List<OutboxEvent> events) {
        List<Long> eventIds = events.stream().map(OutboxEvent::getId).toList();
        try {
            syncImagesTo(properties.indexUid(), events.stream().map(OutboxEvent::getAggregateId).toList());
            outbox.markPublishedBatch(eventIds, clock.instant());
        } catch (MeilisearchAdminException exception) {
            if (exception.kind() == MeilisearchAdminException.Kind.REQUIRES_ACTION) {
                outbox.markFailedBatch(eventIds, safeError(exception));
                log.error("Search index event batch requires action: count={}, firstOutboxId={}, reason={}",
                        events.size(), events.getFirst().getId(), safeError(exception));
            } else {
                if (exception.kind() == MeilisearchAdminException.Kind.INDEX_NOT_FOUND) initializer.markUnavailable();
                reschedule(events, clock.instant(), safeError(exception));
            }
        } catch (Exception exception) {
            reschedule(events, clock.instant(), exception.getClass().getSimpleName());
        }
    }

    private void recoverExpired(Instant now) {
        List<OutboxEvent> expired = outbox.selectProcessingLockedBefore(
                OutboxEventType.PUBLICATION_SEARCH_INDEX_SYNC.name(), now.minus(processingLease()),
                properties.syncBatchSize());
        if (!expired.isEmpty()) reschedule(expired, now, "Search sync lease expired");
    }

    private void reschedule(List<OutboxEvent> events, Instant now, String reason) {
        for (OutboxEvent event : events) {
            int retry = nextRetryCount(event.getRetryCount());
            event.setRetryCount(retry);
            event.setAvailableAt(now.plusSeconds(delaySeconds(retry)));
        }
        outbox.rescheduleBatch(events, reason);
    }

    private Duration processingLease() {
        Duration budget = properties.taskWaitTimeout().multipliedBy(2)
                .plus(properties.indexRequestTimeout().multipliedBy(4))
                .plusSeconds(10);
        return budget.compareTo(MINIMUM_LEASE) < 0 ? MINIMUM_LEASE : budget;
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
