package com.superz.aivista.generation.model;

/** Outbox 事件的分发状态。 */
public enum OutboxStatus {
    PENDING,
    PROCESSING,
    PUBLISHED,
    FAILED
}
