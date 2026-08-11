package com.superz.aivista.user.dto;

/** Current public profile summary for an interaction notification actor. */
public record InteractionNotificationActorResponse(String userId, String nickname, String avatarUrl) {
}
