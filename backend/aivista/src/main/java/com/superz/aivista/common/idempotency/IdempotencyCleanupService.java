package com.superz.aivista.common.idempotency;

import java.time.Clock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 分批清理已过期的创建命令幂等记录。 */
@Service
public class IdempotencyCleanupService {
    private static final Logger log = LoggerFactory.getLogger(IdempotencyCleanupService.class);

    private final IdempotencyRecordMapper idempotencyRecordMapper;
    private final IdempotencyCleanupProperties properties;
    private final Clock clock;

    public IdempotencyCleanupService(IdempotencyRecordMapper idempotencyRecordMapper,
            IdempotencyCleanupProperties properties, Clock clock) {
        this.idempotencyRecordMapper = idempotencyRecordMapper;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.idempotency.cleanup.fixed-delay:10m}")
    public void cleanupExpiredRecords() {
        if (!properties.enabled()) {
            return;
        }
        try {
            int deleted = cleanupOnce();
            if (deleted > 0) {
                log.info("Deleted {} expired idempotency records", deleted);
            }
        } catch (RuntimeException exception) {
            log.warn("Failed to cleanup expired idempotency records", exception);
        }
    }

    int cleanupOnce() {
        Instant expiredBefore = clock.instant();
        int totalDeleted = 0;
        for (int batch = 0; batch < properties.maxBatches(); batch++) {
            int deleted = idempotencyRecordMapper.deleteExpiredBatch(expiredBefore, properties.batchSize());
            totalDeleted += deleted;
            if (deleted < properties.batchSize()) {
                break;
            }
        }
        return totalDeleted;
    }
}
