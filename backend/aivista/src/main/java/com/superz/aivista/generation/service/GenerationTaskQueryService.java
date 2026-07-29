package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.dto.GenerationImageResponse;
import com.superz.aivista.generation.dto.GenerationTaskSnapshotResponse;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
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
    private final GenerationImageMapper imageMapper;
    private final OSS ossClient;
    private final GenerationOssProperties ossProperties;
    private final Clock clock;

    /** 注入任务、图片读取器及仅用于签发私有对象短期 URL 的 OSS 客户端。 */
    public GenerationTaskQueryService(GenerationTaskMapper taskMapper, GenerationImageMapper imageMapper,
            OSS generationOssClient, GenerationOssProperties ossProperties, Clock clock) {
        this.taskMapper = taskMapper;
        this.imageMapper = imageMapper;
        this.ossClient = generationOssClient;
        this.ossProperties = ossProperties;
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
        Instant urlExpiresAt = clock.instant().plus(ossProperties.signedUrlTtl());
        List<GenerationImageResponse> images = isTerminal(task.getStatus())
                ? imageMapper.selectByTaskId(task.getId()).stream()
                        .map(image -> imageResponse(image, urlExpiresAt))
                        .toList()
                : List.of();
        Counts counts = countsOf(task);
        String failureCode = isTerminal(task.getStatus()) ? task.getFailureCode() : null;
        return new GenerationTaskSnapshotResponse(
                String.valueOf(task.getId()), String.valueOf(task.getSessionId()), task.getStatus(), task.getTaskVersion(),
                task.getRequestedImageCount(), task.getCompletedImageCount(), counts.failed(), counts.cancelled(),
                failureCode, failureMessage(failureCode), images, task.getCreatedAt(), task.getCompletedAt());
    }

    /** 将已转存的私有图片转换为带固定过期时间的展示响应。 */
    private GenerationImageResponse imageResponse(GenerationImage image, Instant expiresAt) {
        URL url = ossClient.generatePresignedUrl(ossProperties.bucket(), image.getObjectKey(), Date.from(expiresAt));
        return new GenerationImageResponse(String.valueOf(image.getId()), url.toString(), expiresAt,
                image.getWidth(), image.getHeight());
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
