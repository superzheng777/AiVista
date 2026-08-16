package com.superz.aivista.search.service;

import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.search.client.MeilisearchAdminClient;
import com.superz.aivista.search.client.MeilisearchSearchClient;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class SearchHealthMonitor {
    private static final Logger log = LoggerFactory.getLogger(SearchHealthMonitor.class);
    private final MeilisearchProperties properties;
    private final MeilisearchSearchClient searchClient;
    private final MeilisearchAdminClient adminClient;
    private final SearchIndexInitializer initializer;
    private final GenerationImageMapper images;
    private final OutboxEventMapper outbox;
    private final Clock clock;
    private Boolean available;
    private boolean failedEventsLogged;
    private boolean backlogLogged;
    private Instant mismatchSince;
    private boolean mismatchLogged;

    public SearchHealthMonitor(MeilisearchProperties properties, MeilisearchSearchClient searchClient,
            MeilisearchAdminClient adminClient, SearchIndexInitializer initializer, GenerationImageMapper images,
            OutboxEventMapper outbox, Clock clock) {
        this.properties = properties;
        this.searchClient = searchClient;
        this.adminClient = adminClient;
        this.initializer = initializer;
        this.images = images;
        this.outbox = outbox;
        this.clock = clock;
    }

    @Scheduled(initialDelay = 10_000, fixedDelay = 10_000)
    public void checkAvailability() {
        if (!properties.enabled()) return;
        boolean current = searchClient.healthy();
        if (available == null || current != available) {
            if (current) log.info("Meilisearch is available");
            else log.warn("Meilisearch is unavailable");
            available = current;
        }
    }

    @Scheduled(initialDelay = 60_000, fixedDelay = 60_000)
    public void checkOutbox() {
        if (!properties.enabled()) return;
        String eventType = OutboxEventType.PUBLICATION_SEARCH_INDEX_SYNC.name();
        long failed = outbox.countFailedByEventType(eventType);
        if (failed > 0 && !failedEventsLogged) {
            log.error("Search index events require action: count={}", failed);
            failedEventsLogged = true;
        } else if (failed == 0 && failedEventsLogged) {
            log.info("Search index events requiring action have been cleared");
            failedEventsLogged = false;
        }
        Instant oldest = outbox.selectOldestIncompleteCreatedAt(eventType);
        boolean delayed = oldest != null && oldest.isBefore(clock.instant().minus(Duration.ofMinutes(10)));
        if (delayed && !backlogLogged) {
            log.warn("Search index synchronization is delayed by more than 10 minutes");
            backlogLogged = true;
        } else if (!delayed && backlogLogged) {
            log.info("Search index synchronization backlog has recovered");
            backlogLogged = false;
        }
    }

    @Scheduled(initialDelay = 600_000, fixedDelay = 600_000)
    public void checkDocumentCount() {
        if (!initializer.ready()) return;
        try {
            long mysqlCount = images.countPublishedForSearchIndex();
            long indexCount = adminClient.documentCount(properties.indexUid());
            if (mysqlCount == indexCount) {
                mismatchSince = null;
                if (mismatchLogged) log.info("Search index document count has converged");
                mismatchLogged = false;
                return;
            }
            if (mismatchSince == null) mismatchSince = clock.instant();
            if (!mismatchLogged && !mismatchSince.isAfter(clock.instant().minus(Duration.ofMinutes(10)))) {
                log.warn("Search index document count differs from MySQL: mysql={}, index={}", mysqlCount, indexCount);
                mismatchLogged = true;
            }
        } catch (Exception exception) {
            log.debug("Cannot compare search index document count: {}", exception.getClass().getSimpleName());
        }
    }
}
