package com.superz.aivista.generation.message;

import java.time.Instant;

public record AgentActivityItem(String type, String outcome, String content,
        String toolName, String generationTaskId, Instant startedAt, Instant completedAt) {
}
