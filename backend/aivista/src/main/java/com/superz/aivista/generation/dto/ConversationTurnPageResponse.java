package com.superz.aivista.generation.dto;

import java.util.List;

/** 会话创作轮次游标分页。 */
public record ConversationTurnPageResponse(
        List<ConversationTurnResponse> items,
        String nextBefore,
        boolean hasMore) {
}
