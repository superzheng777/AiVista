package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 单条提示词消息的历史记录。 */
public record GenerationMessageResponse(
        String messageId,
        int sequenceNo,
        String prompt,
        String negativePrompt,
        Instant createdAt) {
}
