package com.superz.aivista.generation.dto;

import java.time.Instant;

public record CreationActivityResponse(int sequenceNo, String type, String outcome,
        String content, String toolName, String generationTaskId, Instant startedAt, Instant completedAt) {
}
