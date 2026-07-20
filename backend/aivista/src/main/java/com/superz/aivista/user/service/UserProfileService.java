package com.superz.aivista.user.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.user.dto.UpdateProfileRequest;
import com.superz.aivista.user.dto.UserProfileResponse;
import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 当前用户个人资料业务。 */
@Service
public class UserProfileService {
    private final UserMapper userMapper;

    public UserProfileService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    public UserProfileResponse getCurrentUser(long userId) {
        return UserProfileResponse.from(requireUser(userId));
    }

    @Transactional
    public UserProfileResponse updateCurrentUser(long userId, UpdateProfileRequest request) {
        User current = requireUser(userId);
        String nickname = UserInputRules.requireValidNickname(request.nickname());
        UserInputRules.requireValidProfileText("bio", request.bio(), 500);

        String avatarUrl = normalizeAvatarUrl(current.getAvatarUrl(), request.avatarUrl());
        userMapper.updateProfile(userId, nickname, avatarUrl, request.bio());
        return UserProfileResponse.from(requireUser(userId));
    }

    private User requireUser(long userId) {
        User user = userMapper.selectOneById(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return user;
    }

    private String normalizeAvatarUrl(String currentAvatarUrl, String requestedAvatarUrl) {
        UserInputRules.requireValidProfileText("avatarUrl", requestedAvatarUrl, 512);
        if (requestedAvatarUrl == null || requestedAvatarUrl.equals(currentAvatarUrl)) {
            return requestedAvatarUrl;
        }
        throw new BusinessException(ErrorCode.MEDIA_FORBIDDEN);
    }
}
