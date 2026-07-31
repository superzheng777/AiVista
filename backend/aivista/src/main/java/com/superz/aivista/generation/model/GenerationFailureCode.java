package com.superz.aivista.generation.model;

/** 任务失败或部分成功时写入 generation_tasks.failure_code 的稳定分类。 */
public enum GenerationFailureCode {
    /** 执行事件无法可靠投递到队列。 */
    QUEUE_DELIVERY_FAILED,
    /** 任务排队超过允许时长。 */
    QUEUE_TIMEOUT,
    /** 队列消费者持续失败且已达到消费重试上限。 */
    QUEUE_CONSUMPTION_FAILED,
    /** 调用可能已发出但无法确认结果，禁止自动重试以避免重复生成。 */
    PROVIDER_CALL_OUTCOME_UNKNOWN,
    /** 可确认服务商请求尚未发出时的连接失败。 */
    PROVIDER_CONNECTION_FAILED,
    /** 服务商明确返回的短时限流，重试耗尽后使用。 */
    PROVIDER_RATE_LIMITED,
    /** 服务商明确返回 HTTP 5xx，重试耗尽后使用。 */
    PROVIDER_SERVICE_UNAVAILABLE,
    /** 服务商配额、计费或商品不可用。 */
    PROVIDER_QUOTA_UNAVAILABLE,
    /** 服务商内容安全拒绝。 */
    PROVIDER_CONTENT_REJECTED,
    /** 服务商参数、鉴权、模型、端点或业务空间配置错误。 */
    PROVIDER_CONFIGURATION_ERROR,
    /** 至少一张图片完成转存，另有图片转存失败。 */
    IMAGE_TRANSFER_PARTIAL_FAILURE,
    /** 服务商返回结果后，所有图片均未完成转存。 */
    IMAGE_TRANSFER_FAILED
}
