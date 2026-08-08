package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Project-wide reliable event written in the same transaction as its aggregate. */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "outbox_events", mapperGenerateEnable = false)
public class OutboxEvent {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private String eventType;
    private String aggregateType;
    private Long aggregateId;
    private Long aggregateVersion;
    private String payloadJson;
    private String status;
    private Integer retryCount;
    private Instant availableAt;
    private Instant lockedAt;
    private Instant publishedAt;
    private String lastError;
    private Instant createdAt;
    private Instant updatedAt;
}
