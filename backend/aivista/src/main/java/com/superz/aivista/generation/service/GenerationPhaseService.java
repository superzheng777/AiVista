package com.superz.aivista.generation.service;

import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.event.GenerationTaskStatusEvent;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.message.GenerationPhaseResponse;
import java.time.Clock;
import java.time.Instant;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Persists the two coarse worker phases and projects them to online clients after commit. */
@Service
public class GenerationPhaseService {
    private static final Set<String> PHASES = Set.of("GENERATING", "SAVING");
    private final GenerationTaskMapper tasks;
    private final GenerationSseConnectionService sse;
    private final GenerationBailianProperties bailian;
    private final Clock clock;

    public GenerationPhaseService(GenerationTaskMapper tasks, GenerationSseConnectionService sse,
            GenerationBailianProperties bailian, Clock clock) {
        this.tasks = tasks;
        this.sse = sse;
        this.bailian = bailian;
        this.clock = clock;
    }

    @Transactional
    public GenerationPhaseResponse report(long taskId, String requestedPhase) {
        if (!PHASES.contains(requestedPhase)) {
            throw new IllegalArgumentException("Unsupported generation phase");
        }
        GenerationTask task = requireTask(taskId);
        if (terminal(task.getStatus()) || rank(task.getStatus()) >= rank(requestedPhase)) {
            return response(task);
        }
        if (!allowed(task.getStatus(), requestedPhase)
                || tasks.advancePhase(taskId, task.getStatus(), task.getRevision(), requestedPhase,
                        clock.instant()) != 1) {
            throw new IllegalStateException("Cannot advance generation task phase");
        }
        GenerationTask updated = requireTask(taskId);
        afterCommit(updated);
        return response(updated);
    }

    private void afterCommit(GenerationTask task) {
        GenerationTaskStatusEvent event = new GenerationTaskStatusEvent(task.getSessionId().toString(),
                task.getId().toString(), task.getRevision(), task.getStatus(), retryCount(task),
                bailian.maxRetries());
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            sse.publish(task.getUserId(), event);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                sse.publish(task.getUserId(), event);
            }
        });
    }

    private GenerationTask requireTask(long taskId) {
        GenerationTask task = tasks.selectByIdForUpdate(taskId);
        if (task == null) throw new IllegalArgumentException("Generation task does not exist");
        return task;
    }

    private static boolean allowed(String current, String requested) {
        return ("QUEUED".equals(current) && "GENERATING".equals(requested))
                || ("GENERATING".equals(current) && "SAVING".equals(requested));
    }

    private static int rank(String status) {
        return switch (status) {
            case "QUEUED" -> 0;
            case "GENERATING" -> 1;
            case "SAVING" -> 2;
            default -> 3;
        };
    }

    private static boolean terminal(String status) {
        return "SUCCEEDED".equals(status) || "PARTIALLY_SUCCEEDED".equals(status) || "FAILED".equals(status);
    }

    private static int retryCount(GenerationTask task) {
        return task.getAttemptCount() == null ? 0 : task.getAttemptCount();
    }

    private static GenerationPhaseResponse response(GenerationTask task) {
        return new GenerationPhaseResponse(task.getId().toString(), task.getStatus(), task.getRevision());
    }
}
