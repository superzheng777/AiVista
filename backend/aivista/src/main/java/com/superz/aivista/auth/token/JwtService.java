package com.superz.aivista.auth.token;

import com.superz.aivista.auth.config.AuthProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/** 负责 HS256 Access Token 的签发和完整校验。 */
@Component
public class JwtService {
    private static final String TOKEN_TYPE_CLAIM = "typ";
    private static final String ACCESS_TOKEN_TYPE = "access";
    private static final int HS256_MINIMUM_KEY_BYTES = 32;

    private final AuthProperties properties;
    private final Clock clock;
    private final SecretKey signingKey;
    private final JwtParser parser;

    public JwtService(AuthProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
        byte[] secret = properties.jwt().secret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < HS256_MINIMUM_KEY_BYTES) {
            throw new IllegalStateException("AIVISTA_JWT_SECRET must contain at least 32 UTF-8 bytes");
        }
        this.signingKey = Keys.hmacShaKeyFor(secret);
        this.parser = Jwts.parser()
                .verifyWith(signingKey)
                .require(TOKEN_TYPE_CLAIM, ACCESS_TOKEN_TYPE)
                .clock(() -> Date.from(clock.instant()))
                .build();
    }

    public String issueAccessToken(long userId) {
        if (userId <= 0) {
            throw new IllegalArgumentException("userId must be positive");
        }
        Instant issuedAt = clock.instant();
        Instant expiresAt = issuedAt.plus(properties.accessTokenTtl());
        return Jwts.builder()
                .subject(Long.toString(userId))
                .claim(TOKEN_TYPE_CLAIM, ACCESS_TOKEN_TYPE)
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .id(UUID.randomUUID().toString())
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    public AccessTokenClaims parseAccessToken(String token) {
        try {
            Claims claims = parser.parseSignedClaims(token).getPayload();
            long userId = Long.parseLong(claims.getSubject());
            if (userId <= 0 || claims.getId() == null || claims.getIssuedAt() == null || claims.getExpiration() == null) {
                throw new InvalidAccessTokenException("Access Token claims are incomplete");
            }
            return new AccessTokenClaims(
                    userId,
                    claims.getId(),
                    claims.getIssuedAt().toInstant(),
                    claims.getExpiration().toInstant());
        } catch (JwtException | IllegalArgumentException exception) {
            throw new InvalidAccessTokenException("Access Token is invalid", exception);
        }
    }
}
