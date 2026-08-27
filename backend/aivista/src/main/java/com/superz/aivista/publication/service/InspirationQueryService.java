package com.superz.aivista.publication.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.model.GenerationImageObjectKeys;
import com.superz.aivista.publication.dto.InspirationPageResponse;
import com.superz.aivista.publication.dto.LikedPublicationResponse;
import com.superz.aivista.publication.entity.ImageAssetLike;
import com.superz.aivista.publication.mapper.ImageAssetLikeMapper;
import java.time.Clock;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class InspirationQueryService {
    private static final int PAGE_SIZE = 30;
    private final ImageAssetMapper images;
    private final ImageAssetLikeMapper likes;
    private final OSS oss;
    private final GenerationOssProperties properties;
    private final Clock clock;

    public InspirationQueryService(ImageAssetMapper images, ImageAssetLikeMapper likes, OSS oss,
            GenerationOssProperties properties, Clock clock) {
        this.images = images;
        this.likes = likes;
        this.oss = oss;
        this.properties = properties;
        this.clock = clock;
    }

    public InspirationPageResponse list(Long viewerUserId, String cursor) {
        Cursor position = decodeCursor(cursor, CursorScope.DISCOVERY);
        int pageSize = PAGE_SIZE;
        List<ImageAsset> page = images.selectPublishedPage(
                position == null ? null : position.publicAt(),
                position == null ? null : position.imageId(), pageSize + 1);
        return toPage(page, pageSize, CursorScope.DISCOVERY, viewerUserId);
    }

    public InspirationPageResponse listFollowing(long viewerUserId, String cursor) {
        Cursor position = decodeCursor(cursor, CursorScope.FOLLOWING);
        int pageSize = PAGE_SIZE;
        List<ImageAsset> page = images.selectFollowingPublishedPage(
                viewerUserId,
                position == null ? null : position.publicAt(),
                position == null ? null : position.imageId(), pageSize + 1);
        return toPage(page, pageSize, CursorScope.FOLLOWING, viewerUserId);
    }

    private InspirationPageResponse toPage(List<ImageAsset> page, int pageSize, CursorScope scope,
            Long viewerUserId) {
        boolean hasMore = page.size() > pageSize;
        List<ImageAsset> rows = hasMore ? page.subList(0, pageSize) : page;
        List<GenerationAssetImageResponse> items = toImages(rows, false, likedImageIds(viewerUserId, rows));
        String nextCursor = hasMore ? encodeCursor(scope, rows.getLast()) : null;
        return new InspirationPageResponse(items, nextCursor);
    }

    public List<GenerationAssetImageResponse> listByUserId(long userId) {
        List<ImageAsset> rows = images.selectPublishedByUserId(userId);
        return toImages(rows, true, likedImageIds(userId, rows));
    }

    public GenerationAssetImageResponse get(long imageId, Long viewerUserId) {
        ImageAsset image = images.selectPublishedById(imageId);
        if (image == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        return toImages(List.of(image), false, likedImageIds(viewerUserId, List.of(image))).get(0);
    }

    public List<GenerationAssetImageResponse> listPublicationsByUserId(long userId, Long viewerUserId) {
        List<ImageAsset> rows = images.selectPublicationsByUserId(userId);
        return toImages(rows, false, likedImageIds(viewerUserId, rows));
    }

    public List<LikedPublicationResponse> listLiked(long ownerUserId, Long viewerUserId) {
        List<ImageAssetLike> relations = likes.selectCurrentVisibleByUserId(ownerUserId);
        if (relations.isEmpty()) {
            return List.of();
        }
        List<Long> imageIds = relations.stream().map(ImageAssetLike::getAssetId).toList();
        List<ImageAsset> imageRows = images.selectPublishedByIds(imageIds);
        Map<Long, GenerationAssetImageResponse> imageById = toImages(imageRows, false,
                likedImageIds(viewerUserId, imageRows)).stream().collect(Collectors.toMap(
                        image -> Long.valueOf(image.imageId()), Function.identity()));
        return relations.stream()
                .map(relation -> new LikedPublicationResponse(imageById.get(relation.getAssetId()), relation.getLikedAt()))
                .filter(item -> item.image() != null)
                .toList();
    }

    public List<GenerationAssetImageResponse> toPublicImages(List<ImageAsset> rows, Long viewerUserId) {
        return toImages(rows, false, likedImageIds(viewerUserId, rows));
    }

    private Set<Long> likedImageIds(Long viewerUserId, List<ImageAsset> rows) {
        return viewerUserId == null || rows.isEmpty() ? Set.of()
                : Set.copyOf(likes.selectCurrentLikedAssetIds(viewerUserId,
                        rows.stream().map(ImageAsset::getId).toList()));
    }

    private List<GenerationAssetImageResponse> toImages(List<ImageAsset> rows, boolean includeFavorite,
            Set<Long> likedImageIds) {
        Instant expiresAt = clock.instant().plus(properties.signedUrlTtl());
        return rows.stream().map(image -> new GenerationAssetImageResponse(
                String.valueOf(image.getId()),
                image.getSourceIndex(),
                urls(image.getObjectKey(), expiresAt), image.getCreatedAt(), includeFavorite && Boolean.TRUE.equals(image.getIsFavorited()),
                image.getPublicationPrompt(), image.getPublicationNegativePrompt(),
                new GenerationAssetImageResponse.GenerationConfig(image.getWidth(), image.getHeight(),
                        image.getPublicationRequestedImageCount(), Boolean.TRUE.equals(image.getPublicationPromptExtend())),
                image.getPublicationReviewStatus() == null ? "NONE" : image.getPublicationReviewStatus(),
                image.getPublicationVersion() == null ? 0L : image.getPublicationVersion(), image.getPublicAt(),
                image.getPublicationTitle(), image.getPublicationDescription(), String.valueOf(image.getUserId()),
                image.getLikeCount() == null ? 0L : image.getLikeCount(), likedImageIds.contains(image.getId())))
                .toList();
    }

    private GenerationAssetImageResponse.ImageUrls urls(String storedKey, Instant expiresAt) {
        GenerationImageObjectKeys keys = GenerationImageObjectKeys.fromStoredValue(storedKey);
        return new GenerationAssetImageResponse.ImageUrls(signed(keys.thumbnail(), expiresAt),
                signed(keys.display(), expiresAt));
    }

    private GenerationAssetImageResponse.ImageUrl signed(String objectKey, Instant expiresAt) {
        return new GenerationAssetImageResponse.ImageUrl(
                oss.generatePresignedUrl(properties.bucket(), objectKey, Date.from(expiresAt)).toString(), expiresAt);
    }

    private static String encodeCursor(CursorScope scope, ImageAsset image) {
        String value = "v1:" + scope.code + ":" + image.getPublicAt().toEpochMilli() + ":" + image.getId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decodeCursor(String cursor, CursorScope expectedScope) {
        if (cursor == null) return null;
        try {
            String value = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] parts = value.split(":", -1);
            if (parts.length != 4 || !"v1".equals(parts[0]) || !expectedScope.code.equals(parts[1])) {
                throw new IllegalArgumentException("Invalid cursor structure");
            }
            long imageId = Long.parseLong(parts[3]);
            if (imageId <= 0) throw new IllegalArgumentException("Invalid image id");
            return new Cursor(Instant.ofEpochMilli(Long.parseLong(parts[2])), imageId);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_CURSOR);
        }
    }

    private enum CursorScope {
        DISCOVERY("discovery"),
        FOLLOWING("following");

        private final String code;

        CursorScope(String code) {
            this.code = code;
        }
    }

    private record Cursor(Instant publicAt, long imageId) {
    }
}
