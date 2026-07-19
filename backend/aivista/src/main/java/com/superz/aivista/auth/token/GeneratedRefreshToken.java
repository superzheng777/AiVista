package com.superz.aivista.auth.token;

/** 新生成的 Refresh Token 明文及其数据库哈希。 */
public record GeneratedRefreshToken(String value, byte[] hash) {
    public GeneratedRefreshToken {
        hash = hash.clone();
    }

    @Override
    public byte[] hash() {
        return hash.clone();
    }
}
