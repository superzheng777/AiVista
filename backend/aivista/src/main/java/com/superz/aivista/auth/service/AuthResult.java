package com.superz.aivista.auth.service;

import java.time.Duration;

/** 认证服务返回给 Controller 的凭证写入信息。 */
public record AuthResult<T>(
        T response,
        String refreshToken,
        Duration refreshTokenTtl) {
}
