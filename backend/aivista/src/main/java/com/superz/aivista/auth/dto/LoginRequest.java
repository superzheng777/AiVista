package com.superz.aivista.auth.dto;

import jakarta.validation.constraints.NotNull;

/** 用户登录请求。 */
public record LoginRequest(
        @NotNull String loginName,
        @NotNull String password) {
}
