package com.superz.aivista.user.dto;

import jakarta.validation.constraints.NotNull;

/** 完整更新当前用户可修改资料。 */
public record UpdateProfileRequest(
        @NotNull String nickname,
        String avatarUrl,
        String bio) {
}
