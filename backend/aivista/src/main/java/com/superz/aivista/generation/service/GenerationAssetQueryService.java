package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.model.GenerationImageObjectKeys;
import java.net.URL;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads the current user's complete visible asset collection. */
@Service
public class GenerationAssetQueryService {
    private final ImageAssetMapper imageMapper;
    private final OSS ossClient;
    private final GenerationOssProperties ossProperties;
    private final Clock clock;

    public GenerationAssetQueryService(ImageAssetMapper imageMapper, OSS generationOssClient,
            GenerationOssProperties ossProperties, Clock clock) {
        this.imageMapper = imageMapper;
        this.ossClient = generationOssClient;
        this.ossProperties = ossProperties;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<GenerationAssetImageResponse> listAll(long userId) {
        Instant expiresAt = clock.instant().plus(ossProperties.signedUrlTtl());
        return imageMapper.selectVisibleByUserId(userId).stream().map(row -> response(row, expiresAt)).toList();
    }

    @Transactional(readOnly = true)
    public GenerationAssetImageResponse get(long userId, long imageId) {
        ImageAsset row = imageMapper.selectVisibleDetailByUserIdAndId(userId, imageId);
        if (row == null) throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        return response(row, clock.instant().plus(ossProperties.signedUrlTtl()));
    }

    @Transactional(readOnly = true)
    public Map<Long, GenerationAssetImageResponse> getByIds(long userId, List<Long> imageIds) {
        if (imageIds.isEmpty()) return Map.of();
        Instant expiresAt = clock.instant().plus(ossProperties.signedUrlTtl());
        return imageIds.stream().map(id -> imageMapper.selectVisibleDetailByUserIdAndId(userId, id))
                .filter(Objects::nonNull).collect(Collectors.toMap(ImageAsset::getId, row -> response(row, expiresAt)));
    }

    /** Only the owning authenticated user may obtain a short-lived original-file download URL. */
    @Transactional(readOnly = true)
    public GenerationAssetImageResponse.ImageUrl originalDownload(long userId, long imageId) {
        ImageAsset row = imageMapper.selectVisibleDetailByUserIdAndId(userId, imageId);
        if (row == null) throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        Instant expiresAt = clock.instant().plus(Duration.ofMinutes(3));
        return signed(row.getOriginalObjectKey(), expiresAt);
    }

    private GenerationAssetImageResponse response(ImageAsset row, Instant expiresAt) {
        return new GenerationAssetImageResponse(String.valueOf(row.getId()), row.getSourceIndex(), urls(row, expiresAt),
                row.getCreatedAt(), Boolean.TRUE.equals(row.getIsFavorited()), row.getPublicationPrompt(), row.getPublicationNegativePrompt(),
                new GenerationAssetImageResponse.GenerationConfig(row.getWidth(), row.getHeight(),
                        row.getPublicationRequestedImageCount(), Boolean.TRUE.equals(row.getPublicationPromptExtend())),
                row.getPublicationReviewStatus() == null ? "NONE" : row.getPublicationReviewStatus(),
                row.getPublicationVersion() == null ? 0L : row.getPublicationVersion(), row.getPublicAt(),
                row.getPublicationTitle(), row.getPublicationDescription(), String.valueOf(row.getUserId()),
                row.getLikeCount() == null ? 0L : row.getLikeCount(), false);
    }

    private GenerationAssetImageResponse.ImageUrls urls(ImageAsset asset, Instant expiresAt) {
        if ("UPLOADED".equals(asset.getOrigin())) {
            GenerationAssetImageResponse.ImageUrl original = signed(asset.getOriginalObjectKey(), expiresAt);
            return new GenerationAssetImageResponse.ImageUrls(original, original);
        }
        GenerationImageObjectKeys keys = GenerationImageObjectKeys.fromStoredValue(asset.getObjectKey());
        return new GenerationAssetImageResponse.ImageUrls(signed(keys.thumbnail(), expiresAt), signed(keys.display(), expiresAt));
    }

    private GenerationAssetImageResponse.ImageUrl signed(String objectKey, Instant expiresAt) {
        URL url = ossClient.generatePresignedUrl(ossProperties.bucket(), objectKey, Date.from(expiresAt));
        return new GenerationAssetImageResponse.ImageUrl(url.toString(), expiresAt);
    }
}
