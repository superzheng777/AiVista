package com.superz.aivista.generation.message;

/** RabbitMQ 执行消息只携带权威任务记录的定位信息，不携带提示词或图片 URL。 */
public record TaskExecuteMessage(long eventId, long taskId, int taskVersion) {
}
