package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 异步图像生成任务的权威状态记录。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "generation_tasks", mapperGenerateEnable = false)
public class GenerationTask {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long userId;
    private Long sessionId;
    private Long sourceMessageId;
    /** TEXT_TO_IMAGE 或 IMAGE_TO_IMAGE，由任务输入资产数量派生。 */
    private String operation;
    private String model;
    /**
     * QUEUED、RUNNING、TRANSFERRING、SUCCEEDED、PARTIALLY_SUCCEEDED 或 FAILED。
     * 仅允许由任务状态机按既定方向迁移。
     */
    private String status;
    /** 每次状态变化递增，供条件更新和 SSE 客户端去重使用。 */
    private Integer taskVersion;
    /** 仅统计允许自动重试的服务商调用次数。 */
    private Integer attemptCount;
    /** 非空表示请求可能已发出；消息重投时不得据此再次调用服务商。 */
    private Instant providerCallStartedAt;
    /** 本次任务实际发送给模型的提示词快照，仅保留给服务端追溯。 */
    private String finalPrompt;
    private String finalNegativePrompt;
    private Integer width;
    private Integer height;
    private Boolean promptExtend;
    private Integer requestedImageCount;
    private Integer completedImageCount;
    /** 平台侧失败返还每日额度后写入，保证同一任务最多返还一次。 */
    private Instant quotaRefundedAt;
    private String providerRequestId;
    /** 仅供崩溃后恢复 OSS 转存的临时服务商结果快照，转存结束后清除。 */
    private String providerResultSnapshot;
    /** 非空表示转存消费者已经领取当前任务；用于区分两分钟排队超时与正常转存耗时。 */
    private Instant transferStartedAt;
    /** 同一用户的一次主动提交及其网络重试使用同一个 UUID v4。 */
    /** 规范化创建参数的 SHA-256 摘要，用于识别相同幂等键的冲突请求。 */
    /** 仅在 FAILED 或 PARTIALLY_SUCCEEDED 时保存稳定失败分类。 */
    private String failureCode;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant startedAt;
    private Instant completedAt;
}
