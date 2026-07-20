package com.superz.aivista.auth.dto;

import jakarta.validation.constraints.NotNull;

/** 注册用户请求。具体业务规则由认证服务统一校验。 */
public record RegisterRequest(
        @NotNull String loginName,
        @NotNull String password,
        @NotNull String nickname) {
}
