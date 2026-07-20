package com.superz.aivista.auth.dto;

import com.superz.aivista.user.dto.UserProfileResponse;

/** 登录成功响应。 */
public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        UserProfileResponse user) {
}
