package com.superz.aivista.common.idempotency;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class IdempotencyCleanupServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-20T00:00:00Z");

    private final IdempotencyRecordMapper mapper = mock(IdempotencyRecordMapper.class);

    @Test
    void deletesExpiredRecordsInBoundedBatches() {
        IdempotencyCleanupService service = service(true, 100, 3);
        when(mapper.deleteExpiredBatch(NOW, 100)).thenReturn(100, 100, 100);

        int deleted = service.cleanupOnce();

        assertThat(deleted).isEqualTo(300);
        verify(mapper, org.mockito.Mockito.times(3)).deleteExpiredBatch(NOW, 100);
    }

    @Test
    void disabledScheduledCleanupDoesNotTouchDatabase() {
        service(false, 100, 3).cleanupExpiredRecords();

        verify(mapper, never()).deleteExpiredBatch(any(), anyInt());
    }

    @Test
    void scheduledCleanupSwallowsMapperFailure() {
        when(mapper.deleteExpiredBatch(NOW, 100)).thenThrow(new IllegalStateException("database unavailable"));

        service(true, 100, 3).cleanupExpiredRecords();

        verify(mapper).deleteExpiredBatch(NOW, 100);
    }

    private IdempotencyCleanupService service(boolean enabled, int batchSize, int maxBatches) {
        return new IdempotencyCleanupService(mapper,
                new IdempotencyCleanupProperties(enabled, batchSize, maxBatches),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
