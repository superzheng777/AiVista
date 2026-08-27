package com.superz.aivista.generation.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.generation.asset-upload")
public record GenerationAssetUploadProperties(long maxBytes, Duration temporaryTtl) {
    public GenerationAssetUploadProperties {
        if (maxBytes < 1) throw new IllegalArgumentException("app.generation.asset-upload.max-bytes must be positive");
        if (temporaryTtl == null || temporaryTtl.isZero() || temporaryTtl.isNegative()) {
            throw new IllegalArgumentException("app.generation.asset-upload.temporary-ttl must be positive");
        }
    }
}
