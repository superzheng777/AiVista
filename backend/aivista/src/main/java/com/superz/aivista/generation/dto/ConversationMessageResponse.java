package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 一次创作轮次中的用户输入或助手回复。 */
public record ConversationMessageResponse(
        String messageId,
        int sequenceNo,
        String role,
        String content,
        Instant createdAt) {
}
