package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 生成会话侧栏所需的最小会话摘要。 */
public record GenerationSessionSummaryResponse(
        String sessionId,
        String title,
        Instant lastMessageAt,
        GenerationSessionLatestTaskResponse latestTask,
        boolean hasActiveTask) {
}
