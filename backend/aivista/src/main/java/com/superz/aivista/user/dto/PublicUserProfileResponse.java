package com.superz.aivista.user.dto;

import com.superz.aivista.user.entity.User;

public record PublicUserProfileResponse(
        String id, String nickname, String avatarUrl, String bio,
        long followerCount, long followingCount, long receivedLikeCount, boolean likesPublic,
        boolean viewerFollowing, boolean viewerFollowedByAuthor) {

    public static PublicUserProfileResponse from(User user, boolean viewerFollowing, boolean viewerFollowedByAuthor) {
        return new PublicUserProfileResponse(String.valueOf(user.getId()), user.getNickname(), user.getAvatarUrl(),
                user.getBio(), user.getFollowerCount(), user.getFollowingCount(), user.getReceivedLikeCount(),
                Boolean.TRUE.equals(user.getLikesPublic()), viewerFollowing, viewerFollowedByAuthor);
    }
}
