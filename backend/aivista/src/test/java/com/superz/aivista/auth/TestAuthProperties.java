package com.superz.aivista.auth;

import com.superz.aivista.auth.config.AuthProperties;
import java.time.Duration;

final class TestAuthProperties {
    private TestAuthProperties() {
    }

    static AuthProperties create() {
        return new AuthProperties(
                Duration.ofMinutes(15),
                Duration.ofDays(14),
                32,
                new AuthProperties.Jwt("test-only-jwt-secret-with-32-bytes-minimum"),
                new AuthProperties.Cookie("refresh_token", "/api/auth", false, "Lax"),
                new AuthProperties.Argon2(16, 32, 1, 16384, 2));
    }
}
