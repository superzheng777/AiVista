package com.superz.aivista.generation.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 百炼图像生成 HTTP 调用的服务端配置。 */
@ConfigurationProperties("app.generation.bailian")
public record GenerationBailianProperties(
        String endpoint,
        String apiKey,
        Duration connectTimeout,
        Duration readTimeout,
        int maxConcurrentCalls,
        int rateLimitPerSecond,
        int maxRetries) {

    public GenerationBailianProperties {
        requireConfigured("app.generation.bailian.endpoint", endpoint);
        requireConfigured("app.generation.bailian.api-key", apiKey);
        requirePositive("app.generation.bailian.connect-timeout", connectTimeout);
        requirePositive("app.generation.bailian.read-timeout", readTimeout);
        requirePositive("app.generation.bailian.max-concurrent-calls", maxConcurrentCalls);
        requirePositive("app.generation.bailian.rate-limit-per-second", rateLimitPerSecond);
        requirePositive("app.generation.bailian.max-retries", maxRetries);
    }

    private static void requireConfigured(String name, String value) {
        if (value == null || value.isBlank() || (value.startsWith("<") && value.endsWith(">"))) {
            throw new IllegalArgumentException(name + " must be configured");
        }
    }

    private static void requirePositive(String name, Duration value) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive");
        }
    }

    private static void requirePositive(String name, int value) {
        if (value <= 0) {
            throw new IllegalArgumentException(name + " must be positive");
        }
    }
}
