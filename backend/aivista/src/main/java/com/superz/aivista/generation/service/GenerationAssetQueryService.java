package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.dto.GenerationAssetImageRow;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.net.URL;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads the current user's complete visible asset collection. */
@Service
public class GenerationAssetQueryService {
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

    @Transactional(readOnly = true)
    public List<GenerationAssetImageResponse> listAll(long userId) {
        Instant expiresAt = clock.instant().plus(ossProperties.signedUrlTtl());
        return imageMapper.selectVisibleByUserId(userId).stream()
                .map(row -> response(row, expiresAt))
                .toList();
    }

    @Transactional(readOnly = true)
    public GenerationAssetImageResponse get(long userId, long imageId) {
        GenerationAssetImageRow row = imageMapper.selectVisibleByUserIdAndId(userId, imageId);
        if (row == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        return response(row, clock.instant().plus(ossProperties.signedUrlTtl()));
    }

    private GenerationAssetImageResponse response(GenerationAssetImageRow row, Instant expiresAt) {
        URL url = ossClient.generatePresignedUrl(ossProperties.bucket(), row.getObjectKey(), Date.from(expiresAt));
        return new GenerationAssetImageResponse(String.valueOf(row.getImageId()), url.toString(), expiresAt,
                row.getCreatedAt(), Boolean.TRUE.equals(row.getFavorited()), row.getFinalPrompt(), row.getFinalNegativePrompt(),
                new GenerationAssetImageResponse.GenerationConfig(row.getWidth(), row.getHeight(),
                        row.getRequestedImageCount(), Boolean.TRUE.equals(row.getPromptExtend())),
                row.getPublicationReviewStatus() == null ? "NONE" : row.getPublicationReviewStatus(),
                row.getPublicationVersion() == null ? 0L : row.getPublicationVersion(), row.getPublicAt(),
                row.getPublicationTitle(), row.getPublicationDescription(), String.valueOf(row.getAuthorId()),
                row.getLikeCount() == null ? 0L : row.getLikeCount(), false);
    }
}
