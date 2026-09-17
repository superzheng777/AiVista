package com.superz.aivista.generation.model;

/** 普通文生图任务的持久化状态。 */
public enum GenerationTaskStatus {
    /** 已受理，尚未由工作器提交终态。 */
    QUEUED,
    /** 工作器正在调用图像生成服务。 */
    GENERATING,
    /** 服务商已返回，工作器正在下载并持久化图片。 */
    SAVING,
    SUCCEEDED,
    PARTIALLY_SUCCEEDED,
    FAILED
}
