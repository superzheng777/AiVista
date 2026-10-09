package com.superz.aivista.user.dto;

import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.entity.UserStats;

public record PublicUserProfileResponse(
        String id, String nickname, String avatarUrl, String bio,
        long followerCount, long followingCount, long receivedLikeCount, boolean likesPublic,
        boolean viewerFollowing, boolean viewerFollowedByAuthor) {

    public static PublicUserProfileResponse from(User user, UserStats stats, boolean viewerFollowing, boolean viewerFollowedByAuthor) {
        return new PublicUserProfileResponse(String.valueOf(user.getId()), user.getNickname(), user.getAvatarUrl(),
                user.getBio(), stats.getFollowerCount(), stats.getFollowingCount(), stats.getReceivedLikeCount(),
                Boolean.TRUE.equals(user.getLikesPublic()), viewerFollowing, viewerFollowedByAuthor);
    }
}
