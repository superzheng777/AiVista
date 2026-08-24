package com.superz.aivista.publication.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.model.GenerationImageObjectKeys;
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
    private static final int FIRST_PAGE_SIZE = 20;
    private static final int NEXT_PAGE_SIZE = 40;
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
        Cursor position = decodeCursor(cursor, CursorScope.DISCOVERY);
        int pageSize = cursor == null ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE;
        List<GenerationImage> page = images.selectPublishedPage(
                position == null ? null : position.publicAt(),
                position == null ? null : position.imageId(), pageSize + 1);
        return toPage(page, pageSize, CursorScope.DISCOVERY, viewerUserId);
    }

    public InspirationPageResponse listFollowing(long viewerUserId, String cursor) {
        Cursor position = decodeCursor(cursor, CursorScope.FOLLOWING);
        int pageSize = cursor == null ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE;
        List<GenerationImage> page = images.selectFollowingPublishedPage(
                viewerUserId,
                position == null ? null : position.publicAt(),
                position == null ? null : position.imageId(), pageSize + 1);
        return toPage(page, pageSize, CursorScope.FOLLOWING, viewerUserId);
    }

    private InspirationPageResponse toPage(List<GenerationImage> page, int pageSize, CursorScope scope,
            Long viewerUserId) {
        boolean hasMore = page.size() > pageSize;
        List<GenerationImage> rows = hasMore ? page.subList(0, pageSize) : page;
        List<GenerationAssetImageResponse> items = toImages(rows, false, likedImageIds(viewerUserId, rows), ImageView.LIST);
        String nextCursor = hasMore ? encodeCursor(scope, rows.getLast()) : null;
        return new InspirationPageResponse(items, nextCursor);
    }

    public List<GenerationAssetImageResponse> listByUserId(long userId) {
        List<GenerationImage> rows = images.selectPublishedByUserId(userId);
        return toImages(rows, true, likedImageIds(userId, rows), ImageView.LIST);
    }

    public GenerationAssetImageResponse get(long imageId, Long viewerUserId) {
        GenerationImage image = images.selectPublishedById(imageId);
        if (image == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        return toImages(List.of(image), false, likedImageIds(viewerUserId, List.of(image)), ImageView.DETAIL).get(0);
    }

    public List<GenerationAssetImageResponse> listPublicationsByUserId(long userId, Long viewerUserId) {
        List<GenerationImage> rows = images.selectPublicationsByUserId(userId);
        return toImages(rows, false, likedImageIds(viewerUserId, rows), ImageView.LIST);
    }

    public List<LikedPublicationResponse> listLiked(long ownerUserId, Long viewerUserId) {
        List<GenerationImageLike> relations = likes.selectCurrentVisibleByUserId(ownerUserId);
        if (relations.isEmpty()) {
            return List.of();
        }
        List<Long> imageIds = relations.stream().map(GenerationImageLike::getImageId).toList();
        List<GenerationImage> imageRows = images.selectPublishedByIds(imageIds);
        Map<Long, GenerationAssetImageResponse> imageById = toImages(imageRows, false,
                likedImageIds(viewerUserId, imageRows), ImageView.LIST).stream().collect(Collectors.toMap(
                        image -> Long.valueOf(image.imageId()), Function.identity()));
        return relations.stream()
                .map(relation -> new LikedPublicationResponse(imageById.get(relation.getImageId()), relation.getLikedAt()))
                .filter(item -> item.image() != null)
                .toList();
    }

    public List<GenerationAssetImageResponse> toPublicImages(List<GenerationImage> rows, Long viewerUserId) {
        return toImages(rows, false, likedImageIds(viewerUserId, rows), ImageView.LIST);
    }

    private Set<Long> likedImageIds(Long viewerUserId, List<GenerationImage> rows) {
        return viewerUserId == null || rows.isEmpty() ? Set.of()
                : Set.copyOf(likes.selectCurrentLikedImageIds(viewerUserId,
                        rows.stream().map(GenerationImage::getId).toList()));
    }

    private List<GenerationAssetImageResponse> toImages(List<GenerationImage> rows, boolean includeFavorite,
            Set<Long> likedImageIds, ImageView view) {
        Instant expiresAt = clock.instant().plus(properties.signedUrlTtl());
        return rows.stream().map(image -> new GenerationAssetImageResponse(
                String.valueOf(image.getId()),
                urls(image.getObjectKey(), expiresAt, view), image.getCreatedAt(), includeFavorite && Boolean.TRUE.equals(image.getFavorited()),
                image.getPublicationPrompt(), image.getPublicationNegativePrompt(),
                new GenerationAssetImageResponse.GenerationConfig(image.getWidth(), image.getHeight(),
                        image.getPublicationRequestedImageCount(), Boolean.TRUE.equals(image.getPublicationPromptExtend())),
                image.getPublicationReviewStatus() == null ? "NONE" : image.getPublicationReviewStatus(),
                image.getPublicationVersion() == null ? 0L : image.getPublicationVersion(), image.getPublicAt(),
                image.getPublicationTitle(), image.getPublicationDescription(), String.valueOf(image.getUserId()),
                image.getLikeCount() == null ? 0L : image.getLikeCount(), likedImageIds.contains(image.getId())))
                .toList();
    }

    private GenerationAssetImageResponse.ImageUrls urls(String storedKey, Instant expiresAt, ImageView view) {
        GenerationImageObjectKeys keys = GenerationImageObjectKeys.fromStoredValue(storedKey);
        return view == ImageView.LIST
                ? new GenerationAssetImageResponse.ImageUrls(signed(keys.thumbnail(), expiresAt), null, null)
                : new GenerationAssetImageResponse.ImageUrls(signed(keys.thumbnail(), expiresAt),
                        signed(keys.display(), expiresAt), signed(keys.original(), expiresAt));
    }

    private GenerationAssetImageResponse.ImageUrl signed(String objectKey, Instant expiresAt) {
        return new GenerationAssetImageResponse.ImageUrl(
                oss.generatePresignedUrl(properties.bucket(), objectKey, Date.from(expiresAt)).toString(), expiresAt);
    }

    private static String encodeCursor(CursorScope scope, GenerationImage image) {
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

    private enum ImageView { LIST, DETAIL }

    private record Cursor(Instant publicAt, long imageId) {
    }
}
