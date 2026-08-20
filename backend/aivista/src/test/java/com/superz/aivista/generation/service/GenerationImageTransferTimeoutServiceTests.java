package com.superz.aivista.generation.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.config.GenerationQueueProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationImageTransferTimeoutServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-20T12:00:00Z");

    @Test
    void scansTransfersThatHaveWaitedTwoMinutesWithoutBeingClaimed() {
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationImageTransferFailureService failureService = mock(GenerationImageTransferFailureService.class);
        GenerationQueueProperties properties = GenerationOutboxDispatcherTests.properties();
        GenerationTask task = new GenerationTask();
        task.setId(301L);
        task.setTaskVersion(2);
        when(taskMapper.selectTransferWaitingBefore(Instant.parse("2026-08-20T11:58:00Z"), 20))
                .thenReturn(List.of(task));

        new GenerationImageTransferTimeoutService(taskMapper, failureService, properties,
                Clock.fixed(NOW, ZoneOffset.UTC)).failWaitingTransfers();

        verify(failureService).failWaitingTimeout(301L, 2, NOW);
    }
}
