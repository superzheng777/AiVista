package com.superz.aivista.auth.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** 认证令牌、Cookie 与密码哈希的集中配置。 */
@Validated
@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
        @NotNull Duration accessTokenTtl,
        @NotNull Duration refreshTokenTtl,
        @Min(32) int refreshTokenBytes,
        @NotNull @Valid Jwt jwt,
        @NotNull @Valid Cookie cookie,
        @NotNull @Valid Argon2 argon2) {

    public record Jwt(@NotBlank String secret) {
    }

    public record Cookie(
            @NotBlank String name,
            @NotBlank String path,
            boolean secure,
            @NotBlank String sameSite) {
    }

    public record Argon2(
            @Min(8) int saltLength,
            @Min(16) int hashLength,
            @Min(1) int parallelism,
            @Min(4096) int memory,
            @Min(1) int iterations) {
    }
}
