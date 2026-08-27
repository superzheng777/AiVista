package com.superz.aivista.search.service;

import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.search.client.MeilisearchAdminClient;
import com.superz.aivista.search.client.MeilisearchAdminException;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class SearchIndexInitializer {
    private static final Logger log = LoggerFactory.getLogger(SearchIndexInitializer.class);
    private static final String LOCK_NAME = "aivista_search_index_init";
    private final MeilisearchProperties properties;
    private final MeilisearchAdminClient client;
    private final ImageAssetMapper images;
    private final JdbcTemplate jdbcTemplate;
    private final AtomicBoolean ready = new AtomicBoolean();
    private final AtomicBoolean failureLogged = new AtomicBoolean();

    public SearchIndexInitializer(MeilisearchProperties properties, MeilisearchAdminClient client,
            ImageAssetMapper images, JdbcTemplate jdbcTemplate) {
        this.properties = properties;
        this.client = client;
        this.images = images;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Scheduled(initialDelay = 5_000, fixedDelay = 30_000)
    public void ensureInitialized() {
        if (!properties.enabled() || ready.get()) return;
        try {
            if (client.indexExists(properties.indexUid())) {
                markReady();
                return;
            }
            jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
                if (!acquireLock(connection)) return null;
                try {
                    if (!client.indexExists(properties.indexUid())) initialize();
                } finally {
                    releaseLock(connection);
                }
                return null;
            });
            if (client.indexExists(properties.indexUid())) markReady();
        } catch (Exception exception) {
            if (failureLogged.compareAndSet(false, true)) {
                log.warn("Search index is not initialized: {}", safeReason(exception));
            }
        }
    }

    public boolean ready() {
        return properties.enabled() && ready.get();
    }

    public void markUnavailable() {
        ready.set(false);
    }

    private void initialize() {
        String temporaryUid = properties.indexUid() + "_initializing";
        if (client.indexExists(temporaryUid)) client.waitForTask(client.deleteIndex(temporaryUid));
        client.waitForTask(client.createIndex(temporaryUid));
        client.waitForTask(client.updateSettings(temporaryUid));
        loadAll(temporaryUid);
        client.waitForTask(client.renameIndex(temporaryUid, properties.indexUid()));
    }

    void loadAll(String indexUid) {
        long afterId = 0;
        while (true) {
            List<ImageAsset> batch = images.selectPublishedForSearchIndex(afterId, properties.syncBatchSize());
            if (batch.isEmpty()) return;
            client.waitForTask(client.upsertDocuments(indexUid,
                    batch.stream().map(SearchIndexProjectionMapper::toDocument).toList()));
            afterId = batch.getLast().getId();
        }
    }

    private void markReady() {
        ready.set(true);
        if (failureLogged.getAndSet(false)) log.info("Search index is available again");
    }

    private static boolean acquireLock(java.sql.Connection connection) throws java.sql.SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT GET_LOCK(?, 0)")) {
            statement.setString(1, LOCK_NAME);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getInt(1) == 1;
            }
        }
    }

    private static void releaseLock(java.sql.Connection connection) {
        try (PreparedStatement statement = connection.prepareStatement("SELECT RELEASE_LOCK(?)")) {
            statement.setString(1, LOCK_NAME);
            statement.executeQuery().close();
        } catch (Exception ignored) {
            // The connection closing also releases the advisory lock.
        }
    }

    private static String safeReason(Exception exception) {
        if (exception instanceof MeilisearchAdminException admin) {
            return admin.kind() + "/" + (admin.errorCode() == null ? "unknown" : admin.errorCode());
        }
        return exception.getClass().getSimpleName();
    }
}
