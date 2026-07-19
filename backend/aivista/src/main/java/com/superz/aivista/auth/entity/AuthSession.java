package com.superz.aivista.auth.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Web 或 App 的独立 Refresh Token 会话。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "auth_sessions", mapperGenerateEnable = false)
public class AuthSession {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long userId;
    private String clientType;
    private byte[] refreshTokenHash;
    private Instant expiresAt;
    private Instant createdAt;
    private Instant updatedAt;
}
