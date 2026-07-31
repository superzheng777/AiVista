package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 个人资产列表中的单张可展示图片及详情视图所需字段。 */
public record GenerationAssetImageResponse(
        String imageId,
        String url,
        Instant urlExpiresAt,
        int width,
        int height,
        Instant createdAt,
        String finalPrompt,
        String finalNegativePrompt) {
}
