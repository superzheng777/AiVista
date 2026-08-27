package com.superz.aivista.publication.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.aliyun.oss.OSS;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.publication.mapper.ImageAssetLikeMapper;
import java.net.URL;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class InspirationQueryServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-09T00:00:00Z");

    @Test
    void listsAllCurrentUsersPublishedImagesIncludingDeletedAssets() throws Exception {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        OSS oss = mock(OSS.class);
        ImageAsset image = image(11L);
        image.setDeletedAt(NOW.minusSeconds(60));
        when(images.selectPublishedByUserId(7L)).thenReturn(List.of(image));
        when(oss.generatePresignedUrl(anyString(), anyString(), any()))
                .thenReturn(new URL("https://oss.example/signed"));

        var response = service(images, oss).listByUserId(7L);

        assertThat(response).singleElement().satisfies(item -> {
            assertThat(item.imageId()).isEqualTo("11");
            assertThat(item.title()).isEqualTo("Published title");
            assertThat(item.imageUrls().thumbnail().expiresAt()).isEqualTo(NOW.plusSeconds(600));
        });
        verify(images).selectPublishedByUserId(7L);
    }

    @Test
    void returnsTwentyImagesAndAnOpaqueCursorOnTheFirstDiscoveryPage() throws Exception {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        OSS oss = mock(OSS.class);
        List<ImageAsset> imagesOnPage = java.util.stream.LongStream.rangeClosed(1, 21)
                .mapToObj(InspirationQueryServiceTests::image).toList();
        when(images.selectPublishedPage(null, null, 31)).thenReturn(imagesOnPage);
        when(oss.generatePresignedUrl(anyString(), anyString(), any()))
                .thenReturn(new URL("https://oss.example/signed"));

        var response = service(images, oss).list(null, null);

        assertThat(response.items()).hasSize(21);
        assertThat(response.nextCursor()).isNull();
        verify(images).selectPublishedPage(null, null, 31);
    }

    @Test
    void returnsFortyImagesOnTheNextDiscoveryPage() throws Exception {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        OSS oss = mock(OSS.class);
        when(images.selectPublishedPage(null, null, 31)).thenReturn(java.util.stream.LongStream.rangeClosed(1, 31)
                .mapToObj(InspirationQueryServiceTests::image).toList());
        when(oss.generatePresignedUrl(anyString(), anyString(), any()))
                .thenReturn(new URL("https://oss.example/signed"));
        InspirationQueryService service = service(images, oss);
        String cursor = service.list(null, null).nextCursor();
        ImageAsset boundary = image(30L);
        when(images.selectPublishedPage(boundary.getPublicAt(), 30L, 31)).thenReturn(
                java.util.stream.LongStream.rangeClosed(101, 131)
                        .mapToObj(InspirationQueryServiceTests::image).toList());

        var response = service.list(null, cursor);

        assertThat(response.items()).hasSize(30);
        assertThat(response.nextCursor()).isNotBlank();
        verify(images).selectPublishedPage(boundary.getPublicAt(), 30L, 31);
    }

    @Test
    void listsCurrentFollowedAuthorsAndRejectsDiscoveryCursorReuse() throws Exception {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        ImageAssetLikeMapper likes = mock(ImageAssetLikeMapper.class);
        OSS oss = mock(OSS.class);
        when(images.selectFollowingPublishedPage(7L, null, null, 31)).thenReturn(List.of(image(11L)));
        when(likes.selectCurrentLikedAssetIds(7L, List.of(11L))).thenReturn(List.of());
        when(images.selectPublishedPage(null, null, 31)).thenReturn(java.util.stream.LongStream.rangeClosed(1, 31)
                .mapToObj(InspirationQueryServiceTests::image).toList());
        when(oss.generatePresignedUrl(anyString(), anyString(), any()))
                .thenReturn(new URL("https://oss.example/signed"));
        InspirationQueryService service = service(images, likes, oss);

        var following = service.listFollowing(7L, null);
        String discoveryCursor = service.list(null, null).nextCursor();

        assertThat(following.items()).singleElement().satisfies(item -> assertThat(item.imageId()).isEqualTo("11"));
        assertThat(following.nextCursor()).isNull();
        verify(images).selectFollowingPublishedPage(7L, null, null, 31);
        assertThatThrownBy(() -> service.listFollowing(7L, discoveryCursor))
                .isInstanceOf(BusinessException.class)
                .satisfies(error -> assertThat(((BusinessException) error).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_CURSOR));
    }

    @Test
    void refreshesOnlyTheRequestedPublishedImage() throws Exception {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        OSS oss = mock(OSS.class);
        when(images.selectPublishedById(11L)).thenReturn(image(11L));
        when(oss.generatePresignedUrl(anyString(), anyString(), any()))
                .thenReturn(new URL("https://oss.example/refreshed"));

        var response = service(images, oss).get(11L, null);

        assertThat(response.imageId()).isEqualTo("11");
        assertThat(response.imageUrls().display().url()).isEqualTo("https://oss.example/refreshed");
        verify(images).selectPublishedById(11L);
    }

    private static InspirationQueryService service(ImageAssetMapper images, OSS oss) {
        return service(images, mock(ImageAssetLikeMapper.class), oss);
    }

    private static InspirationQueryService service(ImageAssetMapper images, ImageAssetLikeMapper likes,
            OSS oss) {
        return new InspirationQueryService(images, likes, oss,
                new GenerationOssProperties("oss.example", "private-bucket", "id", "secret", "users",
                        Duration.ofMinutes(10), Duration.ofSeconds(5), Duration.ofSeconds(60)),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static ImageAsset image(long id) {
        ImageAsset image = new ImageAsset();
        image.setId(id);
        image.setUserId(7L);
        image.setSourceIndex(0);
        image.setCreatedAt(NOW.minusSeconds(1));
        image.setObjectKey("users/7/images/" + id);
        image.setWidth(1024);
        image.setHeight(1024);
        image.setPublicAt(NOW.minusSeconds(1));
        image.setPublicationTitle("Published title");
        image.setPublicationDescription("Published description");
        image.setPublicationPrompt("prompt");
        image.setPublicationRequestedImageCount(1);
        image.setPublicationPromptExtend(true);
        image.setPublicationReviewStatus("APPROVED");
        image.setPublicationVersion(1L);
        return image;
    }
}
