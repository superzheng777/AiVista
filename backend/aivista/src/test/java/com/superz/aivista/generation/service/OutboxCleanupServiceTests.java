package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.config.OutboxCleanupProperties;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class OutboxCleanupServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-24T00:00:00Z");

    private final OutboxEventMapper mapper = mock(OutboxEventMapper.class);

    @Test
    void deletesPublishedEventsInBoundedBatches() {
        OutboxCleanupService service = service(true, 100, 3);
        Instant publishedBefore = NOW.minus(Duration.ofDays(7));
        when(mapper.deletePublishedBefore(publishedBefore, 100)).thenReturn(100, 100, 100);

        assertThat(service.cleanupOnce()).isEqualTo(300);

        verify(mapper, org.mockito.Mockito.times(3)).deletePublishedBefore(publishedBefore, 100);
    }

    @Test
    void disabledCleanupDoesNotTouchDatabase() {
        service(false, 100, 3).cleanupPublishedEvents();

        verify(mapper, never()).deletePublishedBefore(any(), anyInt());
    }

    @Test
    void scheduledCleanupSwallowsMapperFailure() {
        when(mapper.deletePublishedBefore(any(), anyInt())).thenThrow(new IllegalStateException("database unavailable"));

        service(true, 100, 3).cleanupPublishedEvents();

        verify(mapper).deletePublishedBefore(NOW.minus(Duration.ofDays(7)), 100);
    }

    private OutboxCleanupService service(boolean enabled, int batchSize, int maxBatches) {
        return new OutboxCleanupService(mapper,
                new OutboxCleanupProperties(enabled, Duration.ofDays(7), batchSize, maxBatches),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
