package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 单个生成会话的可展示信息。 */
public record GenerationSessionResponse(
        String sessionId,
        String title,
        Instant createdAt,
        Instant lastMessageAt) {
}
