package com.superz.aivista.generation.model;

/** 普通文生图任务的持久化状态。 */
public enum GenerationTaskStatus {
    /** 已创建并等待工作器领取。 */
    QUEUED,
    /** 工作器已通过条件更新领取任务。 */
    RUNNING,
    /** 服务商结果已可靠保存，等待或正在转存私有 OSS。 */
    TRANSFERRING,
    SUCCEEDED,
    PARTIALLY_SUCCEEDED,
    FAILED,
    CANCELLED
}
