package com.superz.aivista.auth.token;

import com.superz.aivista.auth.config.AuthProperties;
import java.time.Duration;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/** 统一创建和清除 Web 端 Refresh Token Cookie。 */
@Component
public class RefreshTokenCookieService {
    private final AuthProperties properties;

    public RefreshTokenCookieService(AuthProperties properties) {
        this.properties = properties;
    }

    public ResponseCookie create(String refreshToken) {
        return create(refreshToken, properties.refreshTokenTtl());
    }

    public ResponseCookie create(String refreshToken, Duration remainingTtl) {
        if (remainingTtl.isNegative() || remainingTtl.isZero()) {
            throw new IllegalArgumentException("remainingTtl must be positive");
        }
        return baseCookie(refreshToken)
                .maxAge(remainingTtl)
                .build();
    }

    public ResponseCookie clear() {
        return baseCookie("")
                .maxAge(Duration.ZERO)
                .build();
    }

    private ResponseCookie.ResponseCookieBuilder baseCookie(String value) {
        AuthProperties.Cookie cookie = properties.cookie();
        return ResponseCookie.from(cookie.name(), value)
                .httpOnly(true)
                .secure(cookie.secure())
                .sameSite(cookie.sameSite())
                .path(cookie.path());
    }
}
