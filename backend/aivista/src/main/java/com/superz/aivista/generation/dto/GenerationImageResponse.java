package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 生成图片快照；已删除图片保留位置，但不包含短期签名地址。 */
public record GenerationImageResponse(
        String imageId,
        int sourceIndex,
        String url,
        Instant urlExpiresAt,
        int width,
        int height) {
}
