package com.superz.aivista.generation.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 已投递 Outbox 事件的保留与清理配置。 */
@ConfigurationProperties("app.outbox.cleanup")
public record OutboxCleanupProperties(
        boolean enabled,
        Duration retention,
        int batchSize,
        int maxBatches) {

    public OutboxCleanupProperties {
        if (retention == null || retention.isZero() || retention.isNegative()) {
            throw new IllegalArgumentException("app.outbox.cleanup.retention must be positive");
        }
        if (batchSize < 1 || maxBatches < 1) {
            throw new IllegalArgumentException("app.outbox.cleanup batch values must be positive");
        }
    }
}
