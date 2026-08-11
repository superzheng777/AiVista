package com.superz.aivista.user.dto;

import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import java.time.Instant;

/** Read model for one interaction notification. */
public record InteractionNotificationResponse(
        String notificationId,
        String eventType,
        InteractionNotificationActorResponse actor,
        GenerationAssetImageResponse image,
        Instant readAt,
        Instant createdAt) {
}
