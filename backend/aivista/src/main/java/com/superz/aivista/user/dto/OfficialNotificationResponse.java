package com.superz.aivista.user.dto;

import java.time.Instant;
import java.util.Map;

/** Read model for an official user notification. */
public record OfficialNotificationResponse(
        String notificationId,
        String eventType,
        String imageId,
        String title,
        String content,
        Map<String, Object> metadata,
        Instant readAt,
        Instant createdAt) {
}
