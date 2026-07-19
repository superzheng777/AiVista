package com.superz.aivista.auth.token;

import java.time.Instant;

/** 已完成签名、类型和有效期校验的 Access Token 内容。 */
public record AccessTokenClaims(
        long userId,
        String tokenId,
        Instant issuedAt,
        Instant expiresAt) {
}
