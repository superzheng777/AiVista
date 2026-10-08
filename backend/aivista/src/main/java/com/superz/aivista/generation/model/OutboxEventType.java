package com.superz.aivista.generation.model;

/** 发布审核、通知与搜索索引的可靠待办类型。 */
public enum OutboxEventType {
    PUBLICATION_TEXT_REVIEW,
    PUBLICATION_STATUS_CHANGED,
    INTERACTION_NOTIFICATION_CREATED,
    PUBLICATION_SEARCH_INDEX_SYNC
}
