package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationSseProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class GenerationSseConnectionServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");

    @Test
    void limitsConnectionsPerUserAndGlobally() {
        GenerationSseConnectionService service = service(2, 3);

        service.connect(7L, NOW.plusSeconds(60));
        service.connect(7L, NOW.plusSeconds(60));

        assertThat(service.activeConnectionCount()).isEqualTo(2);
        assertThatThrownBy(() -> service.connect(7L, NOW.plusSeconds(60)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.RATE_LIMITED));
        service.connect(8L, NOW.plusSeconds(60));
        assertThatThrownBy(() -> service.connect(9L, NOW.plusSeconds(60)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.RATE_LIMITED));
    }

    private static GenerationSseConnectionService service(int perUser, int total) {
        return new GenerationSseConnectionService(new GenerationSseProperties(perUser, total,
                Duration.ofSeconds(15), Duration.ofSeconds(1), 100, Duration.ofSeconds(30)),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
