package com.superz.aivista.generation.model;

/** Creation 只保留用户可感知的整体生命周期，不记录 Agent 内部阶段。 */
public enum CreationTaskStatus {
    RUNNING,
    WAITING_INPUT,
    SUCCEEDED,
    FAILED,
    CANCELLED
}
