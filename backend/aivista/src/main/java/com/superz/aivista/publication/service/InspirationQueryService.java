package com.superz.aivista.publication.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.publication.dto.InspirationPageResponse;
import com.superz.aivista.publication.dto.LikedPublicationResponse;
import com.superz.aivista.publication.entity.GenerationImageLike;
import com.superz.aivista.publication.mapper.GenerationImageLikeMapper;
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
    private final GenerationImageMapper images;
    private final GenerationImageLikeMapper likes;
    private final OSS oss;
    private final GenerationOssProperties properties;
    private final Clock clock;

    public InspirationQueryService(GenerationImageMapper images, GenerationImageLikeMapper likes, OSS oss,
            GenerationOssProperties properties, Clock clock) {
        this.images = images;
        this.likes = likes;
        this.oss = oss;
        this.properties = properties;
        this.clock = clock;
    }

    public InspirationPageResponse list(Long viewerUserId, String cursor) {
        Cursor position = decodeCursor(cursor);
        List<GenerationImage> page = images.selectPublishedPage(
                position == null ? null : position.publicAt(),
                position == null ? null : position.imageId(), PAGE_SIZE + 1);
        boolean hasMore = page.size() > PAGE_SIZE;
        List<GenerationImage> rows = hasMore ? page.subList(0, PAGE_SIZE) : page;
        List<GenerationAssetImageResponse> items = toImages(rows, false, likedImageIds(viewerUserId, rows));
        String nextCursor = hasMore ? encodeCursor(rows.getLast()) : null;
        return new InspirationPageResponse(items, nextCursor);
    }

    public List<GenerationAssetImageResponse> listByUserId(long userId) {
        List<GenerationImage> rows = images.selectPublishedByUserId(userId);
        return toImages(rows, true, likedImageIds(userId, rows));
    }

    public GenerationAssetImageResponse get(long imageId, Long viewerUserId) {
        GenerationImage image = images.selectPublishedById(imageId);
        if (image == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        return toImages(List.of(image), false, likedImageIds(viewerUserId, List.of(image))).get(0);
    }

    public List<GenerationAssetImageResponse> listPublicationsByUserId(long userId, Long viewerUserId) {
        List<GenerationImage> rows = images.selectPublicationsByUserId(userId);
        return toImages(rows, false, likedImageIds(viewerUserId, rows));
    }

    public List<LikedPublicationResponse> listLiked(long ownerUserId, Long viewerUserId) {
        List<GenerationImageLike> relations = likes.selectCurrentVisibleByUserId(ownerUserId);
        if (relations.isEmpty()) {
            return List.of();
        }
        List<Long> imageIds = relations.stream().map(GenerationImageLike::getImageId).toList();
        List<GenerationImage> imageRows = images.selectPublishedByIds(imageIds);
        Map<Long, GenerationAssetImageResponse> imageById = toImages(imageRows, false,
                likedImageIds(viewerUserId, imageRows)).stream().collect(Collectors.toMap(
                        image -> Long.valueOf(image.imageId()), Function.identity()));
        return relations.stream()
                .map(relation -> new LikedPublicationResponse(imageById.get(relation.getImageId()), relation.getLikedAt()))
                .filter(item -> item.image() != null)
                .toList();
    }

    public List<GenerationAssetImageResponse> toPublicImages(List<GenerationImage> rows, Long viewerUserId) {
        return toImages(rows, false, likedImageIds(viewerUserId, rows));
    }

    private Set<Long> likedImageIds(Long viewerUserId, List<GenerationImage> rows) {
        return viewerUserId == null || rows.isEmpty() ? Set.of()
                : Set.copyOf(likes.selectCurrentLikedImageIds(viewerUserId,
                        rows.stream().map(GenerationImage::getId).toList()));
    }

    private List<GenerationAssetImageResponse> toImages(List<GenerationImage> rows, boolean includeFavorite,
            Set<Long> likedImageIds) {
        Instant expiresAt = clock.instant().plus(properties.signedUrlTtl());
        return rows.stream().map(image -> new GenerationAssetImageResponse(
                String.valueOf(image.getId()),
                oss.generatePresignedUrl(properties.bucket(), image.getObjectKey(), Date.from(expiresAt)).toString(),
                expiresAt, image.getCreatedAt(), includeFavorite && Boolean.TRUE.equals(image.getFavorited()),
                image.getPublicationPrompt(), image.getPublicationNegativePrompt(),
                new GenerationAssetImageResponse.GenerationConfig(image.getWidth(), image.getHeight(),
                        image.getPublicationRequestedImageCount(), Boolean.TRUE.equals(image.getPublicationPromptExtend())),
                image.getPublicationReviewStatus() == null ? "NONE" : image.getPublicationReviewStatus(),
                image.getPublicationVersion() == null ? 0L : image.getPublicationVersion(), image.getPublicAt(),
                image.getPublicationTitle(), image.getPublicationDescription(), String.valueOf(image.getUserId()),
                image.getLikeCount() == null ? 0L : image.getLikeCount(), likedImageIds.contains(image.getId())))
                .toList();
    }

    private static String encodeCursor(GenerationImage image) {
        String value = image.getPublicAt().toEpochMilli() + ":" + image.getId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decodeCursor(String cursor) {
        if (cursor == null) return null;
        try {
            String value = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] parts = value.split(":", -1);
            if (parts.length != 2) throw new IllegalArgumentException("Invalid cursor structure");
            long imageId = Long.parseLong(parts[1]);
            if (imageId <= 0) throw new IllegalArgumentException("Invalid image id");
            return new Cursor(Instant.ofEpochMilli(Long.parseLong(parts[0])), imageId);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_CURSOR);
        }
    }

    private record Cursor(Instant publicAt, long imageId) {
    }
}
