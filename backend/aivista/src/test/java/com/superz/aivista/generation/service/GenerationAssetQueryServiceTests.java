package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.aliyun.oss.OSS;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.dto.GenerationAssetImageRow;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.net.URL;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GenerationAssetQueryServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-31T10:00:00Z");

    @Test
    void returnsAllVisibleAssetsWithTheSharedImageDto() throws Exception {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OSS ossClient = mock(OSS.class);
        GenerationAssetImageRow pending = row(100L, NOW, "PENDING", 3L);
        pending.setPublicAt(null);
        pending.setPublicationTitle("待审核作品");
        pending.setPublicationDescription("说明");
        when(imageMapper.selectVisibleByUserId(7L)).thenReturn(List.of(pending, row(99L, NOW.minusSeconds(1), "APPROVED", 4L)));
        when(ossClient.generatePresignedUrl(anyString(), anyString(), any())).thenReturn(new URL("https://oss.example/signed"));

        var response = service(imageMapper, ossClient).listAll(7L);

        assertThat(response).hasSize(2);
        assertThat(response.getFirst()).satisfies(item -> {
            assertThat(item.imageId()).isEqualTo("100");
            assertThat(item.url()).isEqualTo("https://oss.example/signed");
            assertThat(item.urlExpiresAt()).isEqualTo(NOW.plusSeconds(600));
            assertThat(item.favorited()).isFalse();
            assertThat(item.finalPrompt()).isEqualTo("prompt-100");
            assertThat(item.finalNegativePrompt()).isEqualTo("negative-100");
            assertThat(item.generationConfig()).isEqualTo(new GenerationAssetImageResponse.GenerationConfig(1024, 768, 4, true));
            assertThat(item.publicationReviewStatus()).isEqualTo("PENDING");
            assertThat(item.publicationVersion()).isEqualTo(3L);
            assertThat(item.publicAt()).isNull();
            assertThat(item.title()).isEqualTo("待审核作品");
            assertThat(item.description()).isEqualTo("说明");
        });
        ArgumentCaptor<java.util.Date> expiresAt = ArgumentCaptor.forClass(java.util.Date.class);
        verify(ossClient, times(2)).generatePresignedUrl(anyString(), anyString(), expiresAt.capture());
        assertThat(expiresAt.getAllValues()).allSatisfy(value -> assertThat(value.toInstant()).isEqualTo(NOW.plusSeconds(600)));
    }

    @Test
    void returnsOneVisibleAssetWithANewSignedUrl() throws Exception {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OSS ossClient = mock(OSS.class);
        when(imageMapper.selectVisibleByUserIdAndId(7L, 41L)).thenReturn(row(41L, NOW, null, null));
        when(ossClient.generatePresignedUrl(anyString(), anyString(), any())).thenReturn(new URL("https://oss.example/signed-detail"));

        var response = service(imageMapper, ossClient).get(7L, 41L);

        assertThat(response.imageId()).isEqualTo("41");
        assertThat(response.url()).isEqualTo("https://oss.example/signed-detail");
        assertThat(response.publicationReviewStatus()).isEqualTo("NONE");
        assertThat(response.publicationVersion()).isZero();
    }

    @Test
    void returnsPublishedAssetEvenWhenTheAssetPageWasDeleted() throws Exception {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OSS ossClient = mock(OSS.class);
        // 已发布（public_at 非空）的图片资源由发布状态保障：即使资产页已删除（deleted_at 非空），单图查询仍应返回。
        GenerationAssetImageRow published = row(42L, NOW, "APPROVED", 5L);
        published.setPublicAt(NOW);
        when(imageMapper.selectVisibleByUserIdAndId(7L, 42L)).thenReturn(published);
        when(ossClient.generatePresignedUrl(anyString(), anyString(), any())).thenReturn(new URL("https://oss.example/signed-published"));

        var response = service(imageMapper, ossClient).get(7L, 42L);

        assertThat(response.imageId()).isEqualTo("42");
        assertThat(response.publicationReviewStatus()).isEqualTo("APPROVED");
        assertThat(response.publicationVersion()).isEqualTo(5L);
        assertThat(response.publicAt()).isEqualTo(NOW);
        assertThat(response.url()).isEqualTo("https://oss.example/signed-published");
    }

    @Test
    void hidesDeletedOrOtherUsersAssetAsNotFound() {
        assertThatThrownBy(() -> service(mock(GenerationImageMapper.class), mock(OSS.class)).get(7L, 41L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));
    }

    private static GenerationAssetQueryService service(GenerationImageMapper imageMapper, OSS ossClient) {
        return new GenerationAssetQueryService(imageMapper, ossClient,
                new GenerationOssProperties("oss.example", "private-bucket", "key-id", "key-secret", "users",
                        Duration.ofMinutes(10), Duration.ofSeconds(5), Duration.ofSeconds(60)),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationAssetImageRow row(long imageId, Instant createdAt, String status, Long version) {
        GenerationAssetImageRow row = new GenerationAssetImageRow();
        row.setImageId(imageId);
        row.setObjectKey("users/7/images/" + imageId + ".png");
        row.setWidth(1024);
        row.setHeight(768);
        row.setCreatedAt(createdAt);
        row.setFavorited(false);
        row.setFinalPrompt("prompt-" + imageId);
        row.setFinalNegativePrompt("negative-" + imageId);
        row.setRequestedImageCount(4);
        row.setPromptExtend(true);
        row.setPublicationReviewStatus(status);
        row.setPublicationVersion(version);
        return row;
    }
}
