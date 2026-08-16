package com.superz.aivista.search.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.meilisearch")
public record MeilisearchProperties(
        boolean enabled,
        String endpoint,
        String searchKey,
        String adminKey,
        String indexUid,
        Duration searchConnectTimeout,
        Duration searchRequestTimeout,
        Duration indexConnectTimeout,
        Duration indexRequestTimeout,
        Duration taskWaitTimeout,
        int syncBatchSize,
        boolean rebuildOnStartup,
        boolean trustForwardedFor) {

    public MeilisearchProperties {
        if (endpoint == null || endpoint.isBlank()) throw new IllegalArgumentException("app.meilisearch.endpoint is required");
        if (indexUid == null || indexUid.isBlank()) throw new IllegalArgumentException("app.meilisearch.index-uid is required");
        requirePositive("search-connect-timeout", searchConnectTimeout);
        requirePositive("search-request-timeout", searchRequestTimeout);
        requirePositive("index-connect-timeout", indexConnectTimeout);
        requirePositive("index-request-timeout", indexRequestTimeout);
        requirePositive("task-wait-timeout", taskWaitTimeout);
        if (syncBatchSize <= 0) throw new IllegalArgumentException("app.meilisearch.sync-batch-size must be positive");
        if (enabled && (searchKey == null || searchKey.isBlank() || adminKey == null || adminKey.isBlank())) {
            throw new IllegalArgumentException("Meilisearch keys must be configured when enabled");
        }
    }

    private static void requirePositive(String name, Duration value) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException("app.meilisearch." + name + " must be positive");
        }
    }
}
