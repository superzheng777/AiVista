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
        Duration connectTimeout,
        Duration readTimeout,
        String maxObjectSize) {

    public GenerationOssProperties {
        requireConfigured("app.generation.oss.endpoint", endpoint);
        requireConfigured("app.generation.oss.bucket", bucket);
        requireConfigured("app.generation.oss.access-key-id", accessKeyId);
        requireConfigured("app.generation.oss.access-key-secret", accessKeySecret);
        requireConfigured("app.generation.oss.object-prefix", objectPrefix);
        requirePositive("app.generation.oss.signed-url-ttl", signedUrlTtl);
        requirePositive("app.generation.oss.connect-timeout", connectTimeout);
        requirePositive("app.generation.oss.read-timeout", readTimeout);
        parseMebibytes("app.generation.oss.max-object-size", maxObjectSize);
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

    /** 配置固定使用 MiB，避免将 30MiB 悄悄按十进制 30MB 解释。 */
    public long maxObjectSizeBytes() {
        return parseMebibytes("app.generation.oss.max-object-size", maxObjectSize);
    }

    private static long parseMebibytes(String name, String value) {
        requireConfigured(name, value);
        if (!value.endsWith("MiB")) {
            throw new IllegalArgumentException(name + " must use the MiB unit");
        }
        try {
            long mebibytes = Long.parseLong(value.substring(0, value.length() - 3));
            if (mebibytes <= 0) {
                throw new IllegalArgumentException(name + " must be positive");
            }
            return Math.multiplyExact(mebibytes, 1024L * 1024L);
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(name + " must be a whole number of MiB", exception);
        }
    }
}
