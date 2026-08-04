package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.dto.GenerationAssetImageRow;
import com.superz.aivista.generation.dto.GenerationAssetPageResponse;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 以稳定游标读取当前用户仍可见的私有生成资产。 */
@Service
public class GenerationAssetQueryService {
    private static final int DEFAULT_LIMIT = 36;
    private static final int MAX_LIMIT = 60;

    private final GenerationImageMapper imageMapper;
    private final OSS ossClient;
    private final GenerationOssProperties ossProperties;
    private final Clock clock;

    public GenerationAssetQueryService(GenerationImageMapper imageMapper, OSS generationOssClient,
            GenerationOssProperties ossProperties, Clock clock) {
        this.imageMapper = imageMapper;
        this.ossClient = generationOssClient;
        this.ossProperties = ossProperties;
        this.clock = clock;
    }

    /** 返回当前用户的可见资产；签名 URL 仅在本次响应中生成。 */
    @Transactional(readOnly = true)
    public GenerationAssetPageResponse list(long userId, String cursor, Integer requestedLimit) {
        int limit = normalizeLimit(requestedLimit);
        Cursor position = decodeCursor(cursor);
        List<GenerationAssetImageRow> results = imageMapper.selectVisiblePageByUserId(userId,
                position == null ? null : position.createdAt(), position == null ? null : position.imageId(), limit + 1);
        boolean hasMore = results.size() > limit;
        List<GenerationAssetImageRow> page = hasMore ? results.subList(0, limit) : results;
        Instant urlExpiresAt = clock.instant().plus(ossProperties.signedUrlTtl());
        List<GenerationAssetImageResponse> items = page.stream()
                .map(row -> response(row, urlExpiresAt))
                .toList();
        String nextCursor = hasMore ? encodeCursor(page.getLast()) : null;
        return new GenerationAssetPageResponse(items, nextCursor);
    }

    private static int normalizeLimit(Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "limit 必须在 1 到 60 之间");
        }
        return limit;
    }

    private GenerationAssetImageResponse response(GenerationAssetImageRow row, Instant expiresAt) {
        URL url = ossClient.generatePresignedUrl(ossProperties.bucket(), row.getObjectKey(), Date.from(expiresAt));
        return new GenerationAssetImageResponse(String.valueOf(row.getImageId()), url.toString(), expiresAt,
                row.getWidth(), row.getHeight(), row.getCreatedAt(), row.getFinalPrompt(), row.getFinalNegativePrompt(),
                row.getRequestedImageCount());
    }

    private static String encodeCursor(GenerationAssetImageRow row) {
        String value = row.getCreatedAt().toEpochMilli() + ":" + row.getImageId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decodeCursor(String cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            String value = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] parts = value.split(":", -1);
            if (parts.length != 2) {
                throw new IllegalArgumentException("Invalid cursor structure");
            }
            long epochMillis = Long.parseLong(parts[0]);
            long imageId = Long.parseLong(parts[1]);
            if (imageId <= 0) {
                throw new IllegalArgumentException("Invalid image id");
            }
            return new Cursor(Instant.ofEpochMilli(epochMillis), imageId);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_CURSOR);
        }
    }

    private record Cursor(Instant createdAt, long imageId) {
    }
}
