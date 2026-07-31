package com.superz.aivista.generation.dto;

import java.util.List;

/** 当前用户个人生成资产的游标分页响应。 */
public record GenerationAssetPageResponse(
        List<GenerationAssetImageResponse> items,
        String nextCursor) {
}
