package com.superz.aivista.auth.service;

import com.superz.aivista.auth.config.AuthSessionCleanupProperties;
import com.superz.aivista.auth.mapper.AuthSessionMapper;
import java.time.Clock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 分批清理超过保留期的自然过期认证会话。 */
@Service
public class AuthSessionCleanupService {
    private static final Logger log = LoggerFactory.getLogger(AuthSessionCleanupService.class);

    private final AuthSessionMapper authSessionMapper;
    private final AuthSessionCleanupProperties properties;
    private final Clock clock;

    public AuthSessionCleanupService(
            AuthSessionMapper authSessionMapper,
            AuthSessionCleanupProperties properties,
            Clock clock) {
        this.authSessionMapper = authSessionMapper;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.auth.session-cleanup.fixed-delay-ms:3600000}")
    public void cleanupExpiredSessions() {
        if (!properties.enabled()) {
            return;
        }

        try {
            int deleted = cleanupOnce();
            if (deleted > 0) {
                log.info("Deleted {} expired auth sessions", deleted);
            }
        } catch (RuntimeException exception) {
            log.warn("Failed to cleanup expired auth sessions", exception);
        }
    }

    int cleanupOnce() {
        Instant expiredBefore = clock.instant().minus(properties.retention());
        int totalDeleted = 0;
        for (int batch = 0; batch < properties.maxBatches(); batch++) {
            int deleted = authSessionMapper.deleteExpiredBatch(expiredBefore, properties.batchSize());
            totalDeleted += deleted;
            if (deleted < properties.batchSize()) {
                break;
            }
        }
        return totalDeleted;
    }
}
