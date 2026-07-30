package com.superz.aivista.generation.dto;

import java.util.List;

/** 游标分页的生成会话列表响应。 */
public record GenerationSessionPageResponse(
        List<GenerationSessionSummaryResponse> items,
        String nextCursor,
        boolean hasMore) {
}
