package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 个人资产列表中的单张可展示图片及详情视图所需字段。 */
public record GenerationAssetImageResponse(
        String imageId,
        String url,
        Instant urlExpiresAt,
        Instant createdAt,
        boolean favorited,
        String finalPrompt,
        String finalNegativePrompt,
        GenerationConfig generationConfig,
        String publicationReviewStatus,
        long publicationVersion,
        Instant publicAt,
        String title,
        String description) {

    public record GenerationConfig(int width, int height, int requestedImageCount, boolean promptExtend) {
    }
}
