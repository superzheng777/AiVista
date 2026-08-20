package com.superz.aivista.generation.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 生成图片转存到私有 OSS 所需的服务端配置。 */
@ConfigurationProperties("app.generation.oss")
public record GenerationOssProperties(
        String endpoint,
        String bucket,
        String accessKeyId,
        String accessKeySecret,
        String objectPrefix,
        Duration signedUrlTtl,
        Duration uploadConnectTimeout,
        Duration uploadReadTimeout) {

    public GenerationOssProperties {
        requireConfigured("app.generation.oss.endpoint", endpoint);
        requireConfigured("app.generation.oss.bucket", bucket);
        requireConfigured("app.generation.oss.access-key-id", accessKeyId);
        requireConfigured("app.generation.oss.access-key-secret", accessKeySecret);
        requireConfigured("app.generation.oss.object-prefix", objectPrefix);
        requirePositive("app.generation.oss.signed-url-ttl", signedUrlTtl);
        requirePositive("app.generation.oss.upload-connect-timeout", uploadConnectTimeout);
        requirePositive("app.generation.oss.upload-read-timeout", uploadReadTimeout);
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

}
