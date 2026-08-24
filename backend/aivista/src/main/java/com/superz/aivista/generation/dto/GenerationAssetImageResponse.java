package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 个人资产列表中的单张可展示图片及详情视图所需字段。 */
public record GenerationAssetImageResponse(
        String imageId,
        ImageUrls imageUrls,
        Instant createdAt,
        boolean favorited,
        String finalPrompt,
        String finalNegativePrompt,
        GenerationConfig generationConfig,
        String publicationReviewStatus,
        long publicationVersion,
        Instant publicAt,
        String title,
        String description,
        String authorId,
        long likeCount,
        boolean likedByCurrentUser) {

    public record ImageUrls(ImageUrl thumbnail, ImageUrl display, ImageUrl original) {
    }

    public record ImageUrl(String url, Instant expiresAt) {
    }

    public record GenerationConfig(int width, int height, int requestedImageCount, boolean promptExtend) {
    }
}
