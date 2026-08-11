package com.superz.aivista.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/** Batch soft-delete request for the current user's interaction notifications. */
public record DeleteInteractionNotificationsRequest(
        @NotEmpty List<@NotBlank String> notificationIds) {
}
