package com.superz.aivista.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.superz.aivista.auth.token.AccessTokenClaims;
import com.superz.aivista.auth.token.InvalidAccessTokenException;
import com.superz.aivista.auth.token.JwtService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class JwtServiceTests {

    @Test
    void issuesAndParsesMinimalAccessTokenClaims() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-19T00:00:00Z"));
        JwtService service = new JwtService(TestAuthProperties.create(), clock);

        String token = service.issueAccessToken(42L);
        AccessTokenClaims claims = service.parseAccessToken(token);

        assertThat(claims.userId()).isEqualTo(42L);
        assertThat(claims.tokenId()).isNotBlank();
        assertThat(claims.issuedAt()).isEqualTo(clock.instant());
        assertThat(claims.expiresAt()).isEqualTo(clock.instant().plus(Duration.ofMinutes(15)));
    }

    @Test
    void rejectsTamperedAndExpiredTokens() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-19T00:00:00Z"));
        JwtService service = new JwtService(TestAuthProperties.create(), clock);
        String token = service.issueAccessToken(7L);
        int signatureStart = token.lastIndexOf('.') + 1;
        char replacement = token.charAt(signatureStart) == 'A' ? 'B' : 'A';
        String tampered = token.substring(0, signatureStart) + replacement + token.substring(signatureStart + 1);

        assertThatThrownBy(() -> service.parseAccessToken(tampered))
                .isInstanceOf(InvalidAccessTokenException.class);

        clock.advance(Duration.ofMinutes(16));
        assertThatThrownBy(() -> service.parseAccessToken(token))
                .isInstanceOf(InvalidAccessTokenException.class);
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
