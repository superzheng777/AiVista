package com.superz.aivista.generation.dto;

/** 一次生成消息及其对应任务快照。 */
public record GenerationMessageItemResponse(
        GenerationMessageResponse message,
        GenerationTaskSnapshotResponse generation) {
}
