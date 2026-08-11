package com.superz.aivista.user.dto;

import java.time.Instant;
import java.util.Map;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;

/** Read model for an official user notification. */
public record OfficialNotificationResponse(
        String notificationId,
        String eventType,
        String title,
        String content,
        Map<String, Object> metadata,
        GenerationAssetImageResponse image,
        Instant readAt,
        Instant createdAt) {
}
