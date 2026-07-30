package com.superz.aivista.generation.dto;

/** 生成会话列表中展示的最新任务状态摘要。 */
public record GenerationSessionLatestTaskResponse(String taskId, String status, int taskVersion) {
}
