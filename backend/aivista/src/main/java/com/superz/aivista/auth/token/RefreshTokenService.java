package com.superz.aivista.auth.token;

import com.superz.aivista.auth.config.AuthProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Component;

/** 生成不可预测的 Refresh Token，并计算其不可逆查询哈希。 */
@Component
public class RefreshTokenService {
    private final SecureRandom secureRandom;
    private final int tokenBytes;

    public RefreshTokenService(SecureRandom secureRandom, AuthProperties properties) {
        this.secureRandom = secureRandom;
        this.tokenBytes = properties.refreshTokenBytes();
    }

    public GeneratedRefreshToken generate() {
        byte[] randomBytes = new byte[tokenBytes];
        secureRandom.nextBytes(randomBytes);
        String value = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        return new GeneratedRefreshToken(value, hash(value));
    }

    public byte[] hash(String token) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }
}
