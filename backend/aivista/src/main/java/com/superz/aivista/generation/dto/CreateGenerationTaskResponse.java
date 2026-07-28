package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 已接收的普通文生图任务概要。 */
public record CreateGenerationTaskResponse(
        /** 对外始终使用字符串，避免 JavaScript 丢失 BIGINT 精度。 */
        String taskId,
        String sessionId,
        /** 当前创建阶段固定为 QUEUED，实际执行由后续队列工作器完成。 */
        String status,
        /** 后续 SSE 与 REST 对账使用的状态版本。 */
        int taskVersion,
        int requestedImageCount,
        Instant createdAt) {
}
