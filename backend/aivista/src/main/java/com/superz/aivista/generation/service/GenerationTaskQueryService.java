package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.dto.GenerationTaskSnapshotResponse;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.model.GenerationImageObjectKeys;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import java.net.URL;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 读取当前用户可见的任务快照，并只在响应阶段签发私有图片的短期访问地址。 */
@Service
public class GenerationTaskQueryService {
    private final GenerationTaskMapper taskMapper;
    private final ImageAssetMapper imageAssetMapper;
    private final OSS ossClient;
    private final GenerationOssProperties ossProperties;
    private final GenerationBailianProperties bailianProperties;
    private final Clock clock;

    /** 注入任务、图片读取器及仅用于签发私有对象短期 URL 的 OSS 客户端。 */
    public GenerationTaskQueryService(GenerationTaskMapper taskMapper, ImageAssetMapper imageAssetMapper,
            OSS generationOssClient, GenerationOssProperties ossProperties,
            GenerationBailianProperties bailianProperties, Clock clock) {
        this.taskMapper = taskMapper;
        this.imageAssetMapper = imageAssetMapper;
        this.ossClient = generationOssClient;
        this.ossProperties = ossProperties;
        this.bailianProperties = bailianProperties;
        this.clock = clock;
    }

    /**
     * 查询当前用户拥有的任务，并按当前任务状态组装可直接展示的安全快照。
     *
     * <p>任务不存在或不属于当前用户时统一按资源不存在处理；签名 URL 不会持久化。</p>
     */
    @Transactional(readOnly = true)
    public GenerationTaskSnapshotResponse get(long userId, long taskId) {
        GenerationTask task = taskMapper.selectOwnedById(userId, taskId);
        if (task == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        List<ImageAsset> taskImages = isTerminal(task.getStatus())
                ? imageAssetMapper.selectByOriginTaskId(task.getId())
                : List.of();
        return snapshot(task, taskImages);
    }

    /**
     * 将已查询出的任务及图片组装为响应快照，供批量历史查询复用，避免为每条消息重复查询图片。
     */
    GenerationTaskSnapshotResponse snapshot(GenerationTask task, List<ImageAsset> taskImages) {
        Instant urlExpiresAt = clock.instant().plus(ossProperties.signedUrlTtl());
        List<GenerationAssetImageResponse> images = isTerminal(task.getStatus())
                ? taskImages.stream()
                        .map(image -> imageResponse(task, image, urlExpiresAt))
                        .toList()
                : List.of();
        Counts counts = countsOf(task);
        String failureCode = isTerminal(task.getStatus()) ? task.getFailureCode() : null;
        return new GenerationTaskSnapshotResponse(
                String.valueOf(task.getId()), String.valueOf(task.getSessionId()), task.getStatus(), task.getTaskVersion(),
                task.getAttemptCount() == null ? 0 : task.getAttemptCount(), bailianProperties.maxRetries(),
                task.getRequestedImageCount(), task.getCompletedImageCount(), counts.failed(), counts.cancelled(),
                failureCode, failureMessage(failureCode), images, task.getCreatedAt(), task.getCompletedAt());
    }

    /** 将已转存图片转换为任务快照；已删除资产只保留其原始结果位置。 */
    private GenerationAssetImageResponse imageResponse(GenerationTask task, ImageAsset image, Instant expiresAt) {
        GenerationAssetImageResponse.ImageUrls urls = image.getDeletedAt() == null
                ? urls(image.getObjectKey(), expiresAt) : new GenerationAssetImageResponse.ImageUrls(null, null);
        return new GenerationAssetImageResponse(String.valueOf(image.getId()), image.getSourceIndex(), urls,
                image.getCreatedAt(), Boolean.TRUE.equals(image.getIsFavorited()), task.getFinalPrompt(),
                task.getFinalNegativePrompt(), new GenerationAssetImageResponse.GenerationConfig(task.getWidth(),
                        task.getHeight(), task.getRequestedImageCount(), Boolean.TRUE.equals(task.getPromptExtend())),
                image.getPublicationReviewStatus() == null ? "NONE" : image.getPublicationReviewStatus(),
                image.getPublicationVersion() == null ? 0L : image.getPublicationVersion(), image.getPublicAt(),
                image.getPublicationTitle(), image.getPublicationDescription(), String.valueOf(image.getUserId()),
                image.getLikeCount() == null ? 0L : image.getLikeCount(), false);
    }

    private GenerationAssetImageResponse.ImageUrls urls(String storedKey, Instant expiresAt) {
        GenerationImageObjectKeys keys = GenerationImageObjectKeys.fromStoredValue(storedKey);
        return new GenerationAssetImageResponse.ImageUrls(
                signed(keys.thumbnail(), expiresAt), signed(keys.display(), expiresAt));
    }

    private GenerationAssetImageResponse.ImageUrl signed(String objectKey, Instant expiresAt) {
        URL url = ossClient.generatePresignedUrl(ossProperties.bucket(), objectKey, Date.from(expiresAt));
        return new GenerationAssetImageResponse.ImageUrl(url.toString(), expiresAt);
    }

    /** 根据任务终态计算未持久化的失败数和取消数，避免在数据库中重复保存派生字段。 */
    private static Counts countsOf(GenerationTask task) {
        int requested = task.getRequestedImageCount();
        return switch (task.getStatus()) {
            case "SUCCEEDED" -> new Counts(0, 0);
            case "PARTIALLY_SUCCEEDED" -> new Counts(requested - task.getCompletedImageCount(), 0);
            case "FAILED" -> new Counts(requested, 0);
            case "CANCELLED" -> new Counts(0, requested);
            default -> new Counts(0, 0);
        };
    }

    /** 判断任务是否已进入不再执行模型调用的终态。 */
    private static boolean isTerminal(String status) {
        return "SUCCEEDED".equals(status) || "PARTIALLY_SUCCEEDED".equals(status)
                || "FAILED".equals(status) || "CANCELLED".equals(status);
    }

    /** 将内部稳定失败码映射为可安全展示给用户的简短说明。 */
    private static String failureMessage(String failureCode) {
        if (failureCode == null) {
            return null;
        }
        return switch (failureCode) {
            case "PROVIDER_CONTENT_REJECTED" -> "提示词未通过内容安全检查";
            case "PROVIDER_RATE_LIMITED" -> "生成服务繁忙，请稍后重试";
            case "PROVIDER_QUOTA_UNAVAILABLE" -> "生成服务当前不可用";
            case "IMAGE_TRANSFER_PARTIAL_FAILURE" -> "部分图片保存失败";
            case "IMAGE_TRANSFER_FAILED" -> "图片保存失败";
            default -> "生成失败，请稍后重试";
        };
    }

    private record Counts(int failed, int cancelled) {
    }
}
