package com.superz.aivista.generation.service;

import com.superz.aivista.generation.config.OutboxCleanupProperties;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import java.time.Clock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 分批回收已完成且超过保留期的 Outbox 事件；失败与未完成事件保留用于恢复和排障。 */
@Service
public class OutboxCleanupService {
    private static final Logger log = LoggerFactory.getLogger(OutboxCleanupService.class);

    private final OutboxEventMapper outboxEventMapper;
    private final OutboxCleanupProperties properties;
    private final Clock clock;

    public OutboxCleanupService(OutboxEventMapper outboxEventMapper, OutboxCleanupProperties properties, Clock clock) {
        this.outboxEventMapper = outboxEventMapper;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.outbox.cleanup.fixed-delay}")
    public void cleanupPublishedEvents() {
        if (!properties.enabled()) {
            return;
        }
        try {
            int deleted = cleanupOnce();
            if (deleted > 0) {
                log.info("Deleted {} expired published outbox events", deleted);
            }
        } catch (RuntimeException exception) {
            log.warn("Failed to cleanup published outbox events", exception);
        }
    }

    int cleanupOnce() {
        Instant publishedBefore = clock.instant().minus(properties.retention());
        int totalDeleted = 0;
        for (int batch = 0; batch < properties.maxBatches(); batch++) {
            int deleted = outboxEventMapper.deletePublishedBefore(publishedBefore, properties.batchSize());
            totalDeleted += deleted;
            if (deleted < properties.batchSize()) {
                break;
            }
        }
        return totalDeleted;
    }
}
