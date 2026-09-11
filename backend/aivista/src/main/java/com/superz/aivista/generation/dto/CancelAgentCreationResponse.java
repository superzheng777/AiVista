package com.superz.aivista.generation.dto;

import java.time.Instant;

/** Java 已提交的 Agent Creation 取消终态。 */
public record CancelAgentCreationResponse(String creationTaskId, String sessionId,
        String status, long revision, Instant completedAt) {
}
