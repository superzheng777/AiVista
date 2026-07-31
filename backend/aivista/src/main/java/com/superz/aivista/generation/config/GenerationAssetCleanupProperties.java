package com.superz.aivista.generation.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 已删除个人资产的私有 OSS 对象清理配置。 */
@ConfigurationProperties("app.generation.asset-cleanup")
public record GenerationAssetCleanupProperties(
        Duration fixedDelay,
        Duration retryDelay,
        int batchSize) {

    public GenerationAssetCleanupProperties {
        if (fixedDelay == null || fixedDelay.isZero() || fixedDelay.isNegative()) {
            throw new IllegalArgumentException("app.generation.asset-cleanup.fixed-delay must be positive");
        }
        if (retryDelay == null || retryDelay.isZero() || retryDelay.isNegative()) {
            throw new IllegalArgumentException("app.generation.asset-cleanup.retry-delay must be positive");
        }
        if (batchSize < 1) {
            throw new IllegalArgumentException("app.generation.asset-cleanup.batch-size must be positive");
        }
    }
}
