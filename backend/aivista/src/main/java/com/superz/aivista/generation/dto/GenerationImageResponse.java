package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 可展示的私有生成图片；URL 为短期签名地址。 */
public record GenerationImageResponse(
        String imageId,
        String url,
        Instant urlExpiresAt,
        int width,
        int height) {
}
