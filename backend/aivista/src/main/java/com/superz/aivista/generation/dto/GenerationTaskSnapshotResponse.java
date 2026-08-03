package com.superz.aivista.generation.dto;

import java.time.Instant;
import java.util.List;

/** 供任务详情、会话消息和状态对账复用的安全任务快照。 */
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
        int cancelledImageCount,
        String failureCode,
        String failureMessage,
        List<GenerationImageResponse> images,
        Instant createdAt,
        Instant completedAt) {
}
