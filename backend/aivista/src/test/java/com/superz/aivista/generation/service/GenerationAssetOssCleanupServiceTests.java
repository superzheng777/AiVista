package com.superz.aivista.generation.service;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.aliyun.oss.OSS;
import com.superz.aivista.generation.config.GenerationAssetCleanupProperties;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationAssetOssCleanupServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-01T02:00:00Z");

    @Test
    void removesAvailableObjectsAndMarksThemSucceeded() {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OSS ossClient = mock(OSS.class);
        GenerationImage image = image(101L, "users/7/tasks/9/0.png");
        when(imageMapper.selectPendingOssCleanup(NOW, 100)).thenReturn(List.of(image));

        service(imageMapper, ossClient).cleanAvailableObjects();

        verify(ossClient).deleteObject("private-bucket", image.getObjectKey());
        verify(imageMapper).markOssCleanupSucceeded(101L);
        verify(imageMapper, never()).rescheduleOssCleanup(eq(101L), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void reschedulesOnlyTheFailedObjectAndContinuesTheBatch() {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        OSS ossClient = mock(OSS.class);
        GenerationImage failed = image(101L, "users/7/tasks/9/0.png");
        GenerationImage succeeded = image(102L, "users/7/tasks/9/1.png");
        when(imageMapper.selectPendingOssCleanup(NOW, 100)).thenReturn(List.of(failed, succeeded));
        doThrow(new IllegalStateException("OSS unavailable"))
                .when(ossClient).deleteObject("private-bucket", failed.getObjectKey());

        service(imageMapper, ossClient).cleanAvailableObjects();

        verify(imageMapper).rescheduleOssCleanup(eq(101L), eq(NOW.plus(Duration.ofMinutes(10))),
                org.mockito.ArgumentMatchers.contains("IllegalStateException"));
        verify(imageMapper).markOssCleanupSucceeded(102L);
    }

    @Test
    void doesNothingWhenNoCleanupIsDue() {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        when(imageMapper.selectPendingOssCleanup(NOW, 100)).thenReturn(List.of());

        service(imageMapper, mock(OSS.class)).cleanAvailableObjects();

        verify(imageMapper).selectPendingOssCleanup(NOW, 100);
        verify(imageMapper, never()).markOssCleanupSucceeded(org.mockito.ArgumentMatchers.anyLong());
    }

    private static GenerationAssetOssCleanupService service(GenerationImageMapper imageMapper, OSS ossClient) {
        return new GenerationAssetOssCleanupService(imageMapper, ossClient,
                new GenerationOssProperties("oss.example", "private-bucket", "key-id", "key-secret", "users",
                        Duration.ofMinutes(10), Duration.ofSeconds(5), Duration.ofSeconds(60)),
                new GenerationAssetCleanupProperties(Duration.ofMinutes(1), Duration.ofMinutes(10), 100),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationImage image(long id, String objectKey) {
        GenerationImage image = new GenerationImage();
        image.setId(id);
        image.setObjectKey(objectKey);
        return image;
    }
}
