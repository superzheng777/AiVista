package com.superz.aivista.user.dto;

import java.util.List;

/** Fixed-size cursor page of official notifications. */
public record OfficialNotificationPageResponse(List<OfficialNotificationResponse> items, String nextCursor) {
}
