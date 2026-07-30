package com.superz.aivista.generation.dto;

import java.util.List;

/** 会话消息历史的游标分页响应。 */
public record GenerationMessagePageResponse(
        List<GenerationMessageItemResponse> items,
        String nextBefore,
        boolean hasMore) {
}
