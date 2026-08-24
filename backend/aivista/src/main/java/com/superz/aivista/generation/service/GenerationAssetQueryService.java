package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.dto.GenerationAssetImageRow;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.model.GenerationImageObjectKeys;
import java.net.URL;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
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
                .map(row -> response(row, expiresAt, ImageView.LIST))
                .toList();
    }

    @Transactional(readOnly = true)
    public GenerationAssetImageResponse get(long userId, long imageId) {
        GenerationAssetImageRow row = imageMapper.selectVisibleByUserIdAndId(userId, imageId);
        if (row == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        return response(row, clock.instant().plus(ossProperties.signedUrlTtl()), ImageView.DETAIL);
    }

    @Transactional(readOnly = true)
    public Map<Long, GenerationAssetImageResponse> getByIds(long userId, List<Long> imageIds) {
        if (imageIds.isEmpty()) return Map.of();
        Instant expiresAt = clock.instant().plus(ossProperties.signedUrlTtl());
        return imageMapper.selectVisibleByUserIdAndIds(userId, imageIds).stream()
                .collect(Collectors.toMap(GenerationAssetImageRow::getImageId, row -> response(row, expiresAt, ImageView.LIST)));
    }

    private GenerationAssetImageResponse response(GenerationAssetImageRow row, Instant expiresAt, ImageView view) {
        return new GenerationAssetImageResponse(String.valueOf(row.getImageId()), urls(row.getObjectKey(), expiresAt, view),
                row.getCreatedAt(), Boolean.TRUE.equals(row.getFavorited()), row.getFinalPrompt(), row.getFinalNegativePrompt(),
                new GenerationAssetImageResponse.GenerationConfig(row.getWidth(), row.getHeight(),
                        row.getRequestedImageCount(), Boolean.TRUE.equals(row.getPromptExtend())),
                row.getPublicationReviewStatus() == null ? "NONE" : row.getPublicationReviewStatus(),
                row.getPublicationVersion() == null ? 0L : row.getPublicationVersion(), row.getPublicAt(),
                row.getPublicationTitle(), row.getPublicationDescription(), String.valueOf(row.getAuthorId()),
                row.getLikeCount() == null ? 0L : row.getLikeCount(), false);
    }

    private GenerationAssetImageResponse.ImageUrls urls(String storedKey, Instant expiresAt, ImageView view) {
        GenerationImageObjectKeys keys = GenerationImageObjectKeys.fromStoredValue(storedKey);
        return view == ImageView.LIST
                ? new GenerationAssetImageResponse.ImageUrls(signed(keys.thumbnail(), expiresAt), null, null)
                : new GenerationAssetImageResponse.ImageUrls(signed(keys.thumbnail(), expiresAt),
                        signed(keys.display(), expiresAt), signed(keys.original(), expiresAt));
    }

    private GenerationAssetImageResponse.ImageUrl signed(String objectKey, Instant expiresAt) {
        URL url = ossClient.generatePresignedUrl(ossProperties.bucket(), objectKey, Date.from(expiresAt));
        return new GenerationAssetImageResponse.ImageUrl(url.toString(), expiresAt);
    }

    private enum ImageView { LIST, DETAIL }
}
