package com.superz.aivista.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.superz.aivista.auth.token.RefreshTokenCookieService;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseCookie;

class RefreshTokenCookieServiceTests {

    @Test
    void createsHttpOnlyRefreshCookieWithConfiguredScope() {
        RefreshTokenCookieService service = new RefreshTokenCookieService(TestAuthProperties.create());

        ResponseCookie cookie = service.create("refresh-token", Duration.ofHours(6));

        assertThat(cookie.getName()).isEqualTo("refresh_token");
        assertThat(cookie.getValue()).isEqualTo("refresh-token");
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.isSecure()).isFalse();
        assertThat(cookie.getSameSite()).isEqualTo("Lax");
        assertThat(cookie.getPath()).isEqualTo("/api/auth");
        assertThat(cookie.getMaxAge()).isEqualTo(Duration.ofHours(6));
        assertThat(cookie.getDomain()).isNull();
    }

    @Test
    void clearCookieUsesSameScopeAndImmediateExpiry() {
        RefreshTokenCookieService service = new RefreshTokenCookieService(TestAuthProperties.create());

        ResponseCookie cookie = service.clear();

        assertThat(cookie.getValue()).isEmpty();
        assertThat(cookie.getMaxAge()).isZero();
        assertThat(cookie.getPath()).isEqualTo("/api/auth");
        assertThat(cookie.getSameSite()).isEqualTo("Lax");
    }

    @Test
    void rejectsNonPositiveRemainingLifetime() {
        RefreshTokenCookieService service = new RefreshTokenCookieService(TestAuthProperties.create());

        assertThatThrownBy(() -> service.create("refresh-token", Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
