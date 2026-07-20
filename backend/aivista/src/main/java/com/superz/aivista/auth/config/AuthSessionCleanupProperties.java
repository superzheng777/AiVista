package com.superz.aivista.auth.config;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** 过期认证会话清理配置。 */
@Validated
@ConfigurationProperties(prefix = "app.auth.session-cleanup")
public record AuthSessionCleanupProperties(
        boolean enabled,
        @NotNull Duration retention,
        @Min(1) int batchSize,
        @Min(1) int maxBatches) {
}
