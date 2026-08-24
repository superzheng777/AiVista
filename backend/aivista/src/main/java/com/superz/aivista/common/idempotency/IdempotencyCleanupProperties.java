package com.superz.aivista.common.idempotency;

import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** 过期幂等记录清理配置。 */
@Validated
@ConfigurationProperties("app.idempotency.cleanup")
public record IdempotencyCleanupProperties(
        boolean enabled,
        @Min(1) int batchSize,
        @Min(1) int maxBatches) {
}
