package com.superz.aivista.generation.message;

/** 转存队列只携带任务定位和版本信息，临时图片地址始终从数据库快照读取。 */
public record ImageTransferMessage(long outboxEventId, long taskId, int taskVersion) {
}
