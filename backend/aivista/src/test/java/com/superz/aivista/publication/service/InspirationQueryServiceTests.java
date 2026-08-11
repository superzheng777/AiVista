package com.superz.aivista.publication.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.aliyun.oss.OSS;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.publication.mapper.GenerationImageLikeMapper;
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
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        OSS oss = mock(OSS.class);
        GenerationImage image = image(11L);
        image.setDeletedAt(NOW.minusSeconds(60));
        when(images.selectPublishedByUserId(7L)).thenReturn(List.of(image));
        when(oss.generatePresignedUrl(anyString(), anyString(), any()))
                .thenReturn(new URL("https://oss.example/signed"));

        var response = service(images, oss).listByUserId(7L);

        assertThat(response).singleElement().satisfies(item -> {
            assertThat(item.imageId()).isEqualTo("11");
            assertThat(item.title()).isEqualTo("Published title");
            assertThat(item.urlExpiresAt()).isEqualTo(NOW.plusSeconds(600));
        });
        verify(images).selectPublishedByUserId(7L);
    }

    @Test
    void keepsAnonymousInspirationListBoundedToThirtySixImages() throws Exception {
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        OSS oss = mock(OSS.class);
        when(images.selectPublished(36)).thenReturn(List.of());

        assertThat(service(images, oss).list(null)).isEmpty();
        verify(images).selectPublished(36);
    }

    @Test
    void refreshesOnlyTheRequestedPublishedImage() throws Exception {
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        OSS oss = mock(OSS.class);
        when(images.selectPublishedById(11L)).thenReturn(image(11L));
        when(oss.generatePresignedUrl(anyString(), anyString(), any()))
                .thenReturn(new URL("https://oss.example/refreshed"));

        var response = service(images, oss).get(11L, null);

        assertThat(response.imageId()).isEqualTo("11");
        assertThat(response.url()).isEqualTo("https://oss.example/refreshed");
        verify(images).selectPublishedById(11L);
    }

    private static InspirationQueryService service(GenerationImageMapper images, OSS oss) {
        return new InspirationQueryService(images, mock(GenerationImageLikeMapper.class), oss,
                new GenerationOssProperties("oss.example", "private-bucket", "id", "secret", "users",
                        Duration.ofMinutes(10), Duration.ofSeconds(5), Duration.ofSeconds(60), "30MiB"),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationImage image(long id) {
        GenerationImage image = new GenerationImage();
        image.setId(id);
        image.setObjectKey("users/7/images/" + id + ".png");
        image.setWidth(1024);
        image.setHeight(1024);
        image.setPublicAt(NOW.minusSeconds(1));
        image.setPublicationTitle("Published title");
        image.setPublicationDescription("Published description");
        image.setPublicationPrompt("prompt");
        image.setPublicationRequestedImageCount(1);
        image.setPublicationPromptExtend(true);
        return image;
    }
}
