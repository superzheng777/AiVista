package com.superz.aivista.user.dto;

import java.util.List;

/** Fixed-size cursor page of interaction notifications. */
public record InteractionNotificationPageResponse(
        List<InteractionNotificationResponse> items,
        String nextCursor) {
}
