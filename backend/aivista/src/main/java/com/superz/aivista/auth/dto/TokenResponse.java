package com.superz.aivista.auth.dto;

/** Access Token 响应，不包含 Refresh Token。 */
public record TokenResponse(
        String accessToken,
        String tokenType,
        long expiresIn) {
}
