package com.superz.aivista.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.auth.config.AuthSessionCleanupProperties;
import com.superz.aivista.auth.mapper.AuthSessionMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class AuthSessionCleanupServiceTests {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-20T00:00:00Z"), ZoneOffset.UTC);

    private final AuthSessionMapper mapper = mock(AuthSessionMapper.class);

    @Test
    void deletesExpiredSessionsInBoundedBatches() {
        AuthSessionCleanupService service = new AuthSessionCleanupService(
                mapper,
                new AuthSessionCleanupProperties(true, Duration.ofDays(7), 100, 3),
                CLOCK);
        Instant expiredBefore = Instant.parse("2026-07-13T00:00:00Z");
        when(mapper.deleteExpiredBatch(expiredBefore, 100)).thenReturn(100, 100, 100);

        int deleted = service.cleanupOnce();

        assertThat(deleted).isEqualTo(300);
        verify(mapper, org.mockito.Mockito.times(3)).deleteExpiredBatch(expiredBefore, 100);
    }

    @Test
    void disabledScheduledCleanupDoesNotTouchDatabase() {
        AuthSessionCleanupService service = new AuthSessionCleanupService(
                mapper,
                new AuthSessionCleanupProperties(false, Duration.ofDays(7), 100, 3),
                CLOCK);

        service.cleanupExpiredSessions();

        verify(mapper, never()).deleteExpiredBatch(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void scheduledCleanupSwallowsMapperFailure() {
        AuthSessionCleanupService service = new AuthSessionCleanupService(
                mapper,
                new AuthSessionCleanupProperties(true, Duration.ofDays(7), 100, 3),
                CLOCK);
        when(mapper.deleteExpiredBatch(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt()))
                .thenThrow(new IllegalStateException("database unavailable"));

        service.cleanupExpiredSessions();

        verify(mapper).deleteExpiredBatch(Instant.parse("2026-07-13T00:00:00Z"), 100);
    }
}
