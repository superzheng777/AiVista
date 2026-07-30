package com.superz.aivista.generation.event;

/** SSE 发送给用户的最小任务状态通知，不包含提示词、图片地址或服务商信息。 */
public record GenerationTaskStatusEvent(
        String sessionId,
        String taskId,
        int taskVersion,
        String status) {
}
