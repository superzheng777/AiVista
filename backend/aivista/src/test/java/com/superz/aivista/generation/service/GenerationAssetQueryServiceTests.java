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
import com.superz.aivista.generation.dto.GenerationAssetImageRow;
import com.superz.aivista.generation.dto.GenerationAssetPageResponse;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.net.URL;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GenerationAssetQueryServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-31T10:00:00Z");

    @Test
    void returnsVisibleAssetsAndStableNextCursor() throws Exception {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OSS ossClient = mock(OSS.class);
        List<GenerationAssetImageRow> rows = new ArrayList<>();
        for (int index = 0; index < 37; index++) {
            rows.add(row(100L - index, NOW.minusSeconds(index)));
        }
        when(imageMapper.selectVisiblePageByUserId(7L, null, null, 37)).thenReturn(rows);
        when(ossClient.generatePresignedUrl(anyString(), anyString(), any())).thenReturn(new URL("https://oss.example/signed"));

        GenerationAssetPageResponse response = service(imageMapper, ossClient).list(7L, null, null);

        assertThat(response.items()).hasSize(36);
        assertThat(response.nextCursor()).isNotBlank();
        assertThat(response.items().getFirst()).satisfies(item -> {
            assertThat(item.imageId()).isEqualTo("100");
            assertThat(item.url()).isEqualTo("https://oss.example/signed");
            assertThat(item.urlExpiresAt()).isEqualTo(NOW.plusSeconds(600));
            assertThat(item.finalPrompt()).isEqualTo("prompt-100");
        });

        ArgumentCaptor<java.util.Date> expiresAt = ArgumentCaptor.forClass(java.util.Date.class);
        verify(ossClient, times(36)).generatePresignedUrl(anyString(), anyString(), expiresAt.capture());
        assertThat(expiresAt.getAllValues()).allSatisfy(value -> assertThat(value.toInstant()).isEqualTo(NOW.plusSeconds(600)));
    }

    @Test
    void appliesCursorAndRequestedLimit() throws Exception {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OSS ossClient = mock(OSS.class);
        GenerationAssetImageRow row = row(41L, NOW.minusSeconds(20));
        when(ossClient.generatePresignedUrl(anyString(), anyString(), any())).thenReturn(new URL("https://oss.example/signed"));
        String cursor = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString((NOW.toEpochMilli() + ":42").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        when(imageMapper.selectVisiblePageByUserId(7L, NOW, 42L, 2)).thenReturn(List.of(row));

        GenerationAssetPageResponse response = service(imageMapper, ossClient).list(7L, cursor, 1);

        assertThat(response.items()).singleElement().extracting(item -> item.imageId()).isEqualTo("41");
        assertThat(response.nextCursor()).isNull();
    }

    @Test
    void rejectsInvalidCursorAndLimit() {
        GenerationAssetQueryService service = service(mock(GenerationImageMapper.class), mock(OSS.class));

        assertThatThrownBy(() -> service.list(7L, "not-a-cursor", null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_CURSOR));
        assertThatThrownBy(() -> service.list(7L, null, 61))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    private static GenerationAssetQueryService service(GenerationImageMapper imageMapper, OSS ossClient) {
        return new GenerationAssetQueryService(imageMapper, ossClient,
                new GenerationOssProperties("oss.example", "private-bucket", "key-id", "key-secret", "users",
                        Duration.ofMinutes(10), Duration.ofSeconds(5), Duration.ofSeconds(60), "30MiB"),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationAssetImageRow row(long imageId, Instant createdAt) {
        GenerationAssetImageRow row = new GenerationAssetImageRow();
        row.setImageId(imageId);
        row.setObjectKey("users/7/images/" + imageId + ".png");
        row.setWidth(1024);
        row.setHeight(1024);
        row.setCreatedAt(createdAt);
        row.setFinalPrompt("prompt-" + imageId);
        return row;
    }
}
