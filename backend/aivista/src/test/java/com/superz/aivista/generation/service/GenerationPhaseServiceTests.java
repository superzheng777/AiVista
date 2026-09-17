package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class GenerationPhaseServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-17T00:00:00Z");
    private final GenerationTaskMapper tasks = mock(GenerationTaskMapper.class);
    private final GenerationSseConnectionService sse = mock(GenerationSseConnectionService.class);
    private final GenerationPhaseService service = new GenerationPhaseService(tasks, sse,
            new GenerationBailianProperties(3), Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void advancesQueuedTaskToGenerating() {
        GenerationTask queued = task("QUEUED", 0);
        GenerationTask generating = task("GENERATING", 1);
        when(tasks.selectByIdForUpdate(101L)).thenReturn(queued, generating);
        when(tasks.advancePhase(101L, "QUEUED", 0, "GENERATING", NOW)).thenReturn(1);

        var response = service.report(101L, "GENERATING");

        assertThat(response.status()).isEqualTo("GENERATING");
        assertThat(response.taskVersion()).isEqualTo(1);
    }

    @Test
    void repeatedOrLatePhaseIsAnIdempotentRead() {
        GenerationTask saving = task("SAVING", 2);
        when(tasks.selectByIdForUpdate(101L)).thenReturn(saving);

        var response = service.report(101L, "GENERATING");

        assertThat(response.status()).isEqualTo("SAVING");
        verify(tasks, never()).advancePhase(org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    private static GenerationTask task(String status, int version) {
        GenerationTask task = new GenerationTask();
        task.setId(101L);
        task.setUserId(7L);
        task.setSessionId(11L);
        task.setStatus(status);
        task.setTaskVersion(version);
        task.setAttemptCount(0);
        return task;
    }
}
