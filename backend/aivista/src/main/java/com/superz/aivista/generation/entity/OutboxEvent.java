package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 与任务状态在同一事务中写入的可靠分发事件。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "outbox_events", mapperGenerateEnable = false)
public class OutboxEvent {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private String eventType;
    private Long taskId;
    /** 事件对应的任务状态版本，消费者据此读取权威任务快照。 */
    private Integer taskVersion;
    /**
     * PENDING（待领取）、PROCESSING（已领取并投递中）、PUBLISHED（已确认分发）或 FAILED（投递最终失败）。
     */
    private String status;
    /** 只记录 Outbox 投递重试，不等同于模型调用重试。 */
    private Integer retryCount;
    private Instant availableAt;
    private Instant lockedAt;
    private Instant publishedAt;
    private String lastError;
    private Instant createdAt;
}
