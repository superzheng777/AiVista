package com.superz.aivista.search.service;

import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.search.client.MeilisearchAdminClient;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Clock;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

@Service
public class SearchIndexRebuildService {
    private static final Logger log = LoggerFactory.getLogger(SearchIndexRebuildService.class);
    private static final String LOCK_NAME = "aivista_search_index_rebuild";
    private final MeilisearchProperties properties;
    private final MeilisearchAdminClient client;
    private final SearchIndexInitializer initializer;
    private final SearchIndexOutboxDispatcher dispatcher;
    private final OutboxEventMapper outbox;
    private final Clock clock;
    private final JdbcTemplate jdbcTemplate;

    public SearchIndexRebuildService(MeilisearchProperties properties, MeilisearchAdminClient client,
            SearchIndexInitializer initializer, SearchIndexOutboxDispatcher dispatcher,
            OutboxEventMapper outbox, Clock clock, JdbcTemplate jdbcTemplate) {
        this.properties = properties;
        this.client = client;
        this.initializer = initializer;
        this.dispatcher = dispatcher;
        this.outbox = outbox;
        this.clock = clock;
        this.jdbcTemplate = jdbcTemplate;
    }

    public void rebuild() {
        if (!properties.enabled()) throw new IllegalStateException("Meilisearch is disabled");
        Boolean executed = jdbcTemplate.execute((ConnectionCallback<Boolean>) connection -> {
            if (!acquireLock(connection)) return false;
            try {
                rebuildWhileLocked();
                return true;
            } finally {
                releaseLock(connection);
            }
        });
        if (!Boolean.TRUE.equals(executed)) throw new IllegalStateException("Another search index rebuild is running");
    }

    private void rebuildWhileLocked() {
        initializer.ensureInitialized();
        if (!initializer.ready()) throw new IllegalStateException("The active search index is unavailable");
        long startWatermark = outbox.selectMaxId();
        String temporaryUid = properties.indexUid() + "_rebuild_" + clock.instant().toEpochMilli();
        client.waitForTask(client.createIndex(temporaryUid));
        client.waitForTask(client.updateSettings(temporaryUid));
        initializer.loadAll(temporaryUid);
        dispatcher.runPaused(() -> catchUpAndSwap(temporaryUid, startWatermark));
        log.info("Search index rebuild completed; previous active index retained as {}", temporaryUid);
    }

    private void catchUpAndSwap(String temporaryUid, long startWatermark) {
        long throughId = outbox.selectMaxId();
        long afterId = startWatermark;
        while (afterId < throughId) {
            List<OutboxEvent> events = outbox.selectByEventTypeAndIdRange(
                    OutboxEventType.PUBLICATION_SEARCH_INDEX_SYNC.name(), afterId, throughId,
                    properties.syncBatchSize());
            if (events.isEmpty()) break;
            Set<Long> imageIds = new LinkedHashSet<>();
            for (OutboxEvent event : events) imageIds.add(event.getAggregateId());
            for (Long imageId : imageIds) dispatcher.syncImageTo(temporaryUid, imageId);
            afterId = events.getLast().getId();
        }
        client.waitForTask(client.swapIndexes(properties.indexUid(), temporaryUid));
    }

    private static boolean acquireLock(java.sql.Connection connection) throws java.sql.SQLException {
        try (java.sql.PreparedStatement statement = connection.prepareStatement("SELECT GET_LOCK(?, 0)")) {
            statement.setString(1, LOCK_NAME);
            try (java.sql.ResultSet result = statement.executeQuery()) {
                return result.next() && result.getInt(1) == 1;
            }
        }
    }

    private static void releaseLock(java.sql.Connection connection) {
        try (java.sql.PreparedStatement statement = connection.prepareStatement("SELECT RELEASE_LOCK(?)")) {
            statement.setString(1, LOCK_NAME);
            statement.executeQuery().close();
        } catch (Exception ignored) {
            // The connection closing also releases the advisory lock.
        }
    }
}
