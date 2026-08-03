package com.superz.aivista.generation.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.config.GenerationSseProperties;
import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.event.GenerationTaskStatusEvent;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationStatusEventDispatcherTests {
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");

    @Test
    void publishesMatchingCurrentTaskStateAndMarksOutboxPublished() {
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationSseConnectionService connections = mock(GenerationSseConnectionService.class);
        OutboxEvent event = event(99L, 301L, 4);
        GenerationTask task = task(301L, 7L, 201L, 4, "CANCELLED");
        when(outboxMapper.selectAvailableTaskStatusChanges(NOW, 100)).thenReturn(List.of(event));
        when(outboxMapper.claimPending(99L, NOW, NOW)).thenReturn(1);
        when(taskMapper.selectStatusEventTaskById(301L)).thenReturn(task);

        dispatcher(outboxMapper, taskMapper, connections).dispatchAvailableEvents();

        verify(connections).publish(7L, 99L,
                new GenerationTaskStatusEvent("201", "301", 4, "CANCELLED", 1, 3));
        verify(outboxMapper).markPublished(99L, NOW);
    }

    @Test
    void publishesStateSnapshotEvenWhenTaskHasAlreadyAdvanced() {
        OutboxEventMapper outboxMapper = mock(OutboxEventMapper.class);
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationSseConnectionService connections = mock(GenerationSseConnectionService.class);
        OutboxEvent event = event(99L, 301L, 3);
        when(outboxMapper.selectAvailableTaskStatusChanges(NOW, 100)).thenReturn(List.of(event));
        when(outboxMapper.claimPending(99L, NOW, NOW)).thenReturn(1);
        when(taskMapper.selectStatusEventTaskById(301L)).thenReturn(task(301L, 7L, 201L, 4, "CANCELLED"));

        dispatcher(outboxMapper, taskMapper, connections).dispatchAvailableEvents();

        verify(connections).publish(7L, 99L,
                new GenerationTaskStatusEvent("201", "301", 3, "RUNNING", 1, 3));
        verify(outboxMapper).markPublished(99L, NOW);
    }

    private static GenerationStatusEventDispatcher dispatcher(OutboxEventMapper outboxMapper,
            GenerationTaskMapper taskMapper, GenerationSseConnectionService connections) {
        return new GenerationStatusEventDispatcher(outboxMapper, taskMapper, connections,
                new GenerationSseProperties(3, 1000, Duration.ofSeconds(15), Duration.ofSeconds(1), 100),
                new GenerationBailianProperties("https://example.com", "key", Duration.ofSeconds(5),
                        Duration.ofSeconds(330), 25, 2, 3),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static OutboxEvent event(long id, long taskId, int taskVersion) {
        OutboxEvent event = new OutboxEvent();
        event.setId(id);
        event.setTaskId(taskId);
        event.setTaskVersion(taskVersion);
        event.setTaskStatus(taskVersion == 3 ? "RUNNING" : "CANCELLED");
        event.setModelRetryCount(1);
        return event;
    }

    private static GenerationTask task(long id, long userId, long sessionId, int taskVersion, String status) {
        GenerationTask task = new GenerationTask();
        task.setId(id);
        task.setUserId(userId);
        task.setSessionId(sessionId);
        task.setTaskVersion(taskVersion);
        task.setStatus(status);
        return task;
    }
}
