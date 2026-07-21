package com.superz.aivista.user.dto;

import com.superz.aivista.user.entity.User;
import java.time.Instant;

/** 当前用户个人资料响应。 */
public record UserProfileResponse(
        String id,
        String loginName,
        String nickname,
        String avatarUrl,
        String bio,
        Instant createdAt,
        Instant updatedAt) {

    public static UserProfileResponse from(User user) {
        return new UserProfileResponse(
                user.getId().toString(),
                user.getLoginName(),
                user.getNickname(),
                user.getAvatarUrl(),
                user.getBio(),
                user.getCreatedAt(),
                user.getUpdatedAt());
    }
}
