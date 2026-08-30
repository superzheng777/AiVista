package com.superz.aivista.generation.dto;

import java.time.Instant;
import java.util.List;

/** 供任务详情、会话创作轮次和状态对账复用的安全任务快照。 */
public record GenerationTaskSnapshotResponse(
        String taskId,
        String sessionId,
        String status,
        int taskVersion,
        int retryCount,
        int maxRetryCount,
        int requestedImageCount,
        int completedImageCount,
        int failedImageCount,
        String failureCode,
        String failureMessage,
        List<GenerationAssetImageResponse> images,
        Instant createdAt,
        Instant completedAt) {
}
