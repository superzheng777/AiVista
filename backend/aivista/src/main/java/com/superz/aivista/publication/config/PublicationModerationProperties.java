package com.superz.aivista.publication.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.publication.moderation")
public record PublicationModerationProperties(
        String endpoint,
        String service,
        Duration connectTimeout,
        Duration readTimeout) {

    public PublicationModerationProperties {
        requireConfigured("app.publication.moderation.endpoint", endpoint);
        requireConfigured("app.publication.moderation.service", service);
        requirePositive("app.publication.moderation.connect-timeout", connectTimeout);
        requirePositive("app.publication.moderation.read-timeout", readTimeout);
    }

    private static void requireConfigured(String name, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must be configured");
        }
    }

    private static void requirePositive(String name, Duration value) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive");
        }
    }
}
