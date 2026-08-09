package com.superz.aivista.user.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

/** Read model for an official user notification. */
public record OfficialNotificationResponse(
        String notificationId,
        String eventType,
        String imageId,
        String title,
        String content,
        JsonNode metadata,
        Instant readAt,
        Instant createdAt) {
}
