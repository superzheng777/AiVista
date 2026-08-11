package com.superz.aivista.user.dto;

/** Combined unread badge counts for the notification center. */
public record NotificationUnreadCountResponse(
        long officialUnreadCount,
        long interactionUnreadCount,
        long totalUnreadCount) {
}
