package com.superz.aivista.generation.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 从百炼临时地址读取生成图片时使用的网络配置。 */
@ConfigurationProperties("app.generation.image-transfer")
public record GenerationImageTransferProperties(
        Duration sourceConnectTimeout,
        Duration sourceReadTimeout) {

    public GenerationImageTransferProperties {
        requirePositive("app.generation.image-transfer.source-connect-timeout", sourceConnectTimeout);
        requirePositive("app.generation.image-transfer.source-read-timeout", sourceReadTimeout);
    }

    private static void requirePositive(String name, Duration value) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive");
        }
    }
}
