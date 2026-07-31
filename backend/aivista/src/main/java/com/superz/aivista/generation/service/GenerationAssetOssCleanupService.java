package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSException;
import com.superz.aivista.generation.config.GenerationAssetCleanupProperties;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 定期清理已从个人资产中删除的私有 OSS 图片。 */
@Service
public class GenerationAssetOssCleanupService {
    private static final int ERROR_MAX_LENGTH = 512;

    private final GenerationImageMapper imageMapper;
    private final OSS ossClient;
    private final GenerationOssProperties ossProperties;
    private final GenerationAssetCleanupProperties cleanupProperties;
    private final Clock clock;

    public GenerationAssetOssCleanupService(GenerationImageMapper imageMapper, OSS generationOssClient,
            GenerationOssProperties ossProperties, GenerationAssetCleanupProperties cleanupProperties, Clock clock) {
        this.imageMapper = imageMapper;
        this.ossClient = generationOssClient;
        this.ossProperties = ossProperties;
        this.cleanupProperties = cleanupProperties;
        this.clock = clock;
    }

    /** 单实例按固定周期扫描；OSS 删除幂等，因此不设置 PROCESSING 状态或领取锁。 */
    @Scheduled(fixedDelayString = "${app.generation.asset-cleanup.fixed-delay}")
    public void cleanAvailableObjects() {
        Instant now = clock.instant();
        List<GenerationImage> images = imageMapper.selectPendingOssCleanup(now, cleanupProperties.batchSize());
        for (GenerationImage image : images) {
            clean(image, now);
        }
    }

    private void clean(GenerationImage image, Instant now) {
        try {
            ossClient.deleteObject(ossProperties.bucket(), image.getObjectKey());
            imageMapper.markOssCleanupSucceeded(image.getId());
        } catch (OSSException exception) {
            if (isMissingObject(exception)) {
                imageMapper.markOssCleanupSucceeded(image.getId());
                return;
            }
            reschedule(image, now, safeError(exception));
        } catch (Exception exception) {
            reschedule(image, now, safeError(exception));
        }
    }

    private void reschedule(GenerationImage image, Instant now, String error) {
        imageMapper.rescheduleOssCleanup(image.getId(), now.plus(cleanupProperties.retryDelay()), error);
    }

    private static boolean isMissingObject(OSSException exception) {
        return "NoSuchKey".equals(exception.getErrorCode()) || "NoSuchObject".equals(exception.getErrorCode());
    }

    private static String safeError(Exception exception) {
        String message = exception.getMessage();
        String value = exception.getClass().getSimpleName() + (message == null ? "" : ": " + message);
        return value.length() <= ERROR_MAX_LENGTH ? value : value.substring(0, ERROR_MAX_LENGTH);
    }
}
