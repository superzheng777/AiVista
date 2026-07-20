package com.superz.aivista.auth.service;

import com.superz.aivista.auth.config.AuthProperties;
import com.superz.aivista.auth.dto.LoginRequest;
import com.superz.aivista.auth.dto.LoginResponse;
import com.superz.aivista.auth.dto.RegisterRequest;
import com.superz.aivista.auth.dto.TokenResponse;
import com.superz.aivista.auth.entity.AuthSession;
import com.superz.aivista.auth.mapper.AuthSessionMapper;
import com.superz.aivista.auth.token.GeneratedRefreshToken;
import com.superz.aivista.auth.token.JwtService;
import com.superz.aivista.auth.token.RefreshTokenService;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.user.dto.UserProfileResponse;
import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.service.UserInputRules;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 注册、登录、刷新和退出的认证业务。 */
@Service
public class AuthService {
    private static final String TOKEN_TYPE = "Bearer";
    private static final String CLIENT_TYPE_WEB = "WEB";

    private final UserMapper userMapper;
    private final AuthSessionMapper authSessionMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final AuthProperties properties;
    private final Clock clock;

    public AuthService(
            UserMapper userMapper,
            AuthSessionMapper authSessionMapper,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            RefreshTokenService refreshTokenService,
            AuthProperties properties,
            Clock clock) {
        this.userMapper = userMapper;
        this.authSessionMapper = authSessionMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public UserProfileResponse register(RegisterRequest request) {
        String loginName = UserInputRules.normalizeLoginName(request.loginName());
        String nickname = UserInputRules.normalizeNickname(request.nickname());
        UserInputRules.requireValidLoginName(loginName);
        UserInputRules.requireValidPassword(request.password());

        User user = new User();
        user.setLoginName(loginName);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setNickname(nickname);

        try {
            userMapper.insertSelective(user);
        } catch (DuplicateKeyException exception) {
            throw new BusinessException(ErrorCode.LOGIN_NAME_EXISTS);
        }

        return UserProfileResponse.from(userMapper.selectOneById(user.getId()));
    }

    @Transactional
    public AuthResult<LoginResponse> login(LoginRequest request) {
        String loginName = UserInputRules.normalizeLoginName(request.loginName());
        User user = userMapper.selectByLoginName(loginName);
        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.LOGIN_FAILED);
        }

        GeneratedRefreshToken refreshToken = refreshTokenService.generate();
        Instant expiresAt = clock.instant().plus(properties.refreshTokenTtl());
        AuthSession session = new AuthSession();
        session.setUserId(user.getId());
        session.setClientType(CLIENT_TYPE_WEB);
        session.setRefreshTokenHash(refreshToken.hash());
        session.setExpiresAt(expiresAt);
        authSessionMapper.insertSelective(session);

        LoginResponse response = new LoginResponse(
                jwtService.issueAccessToken(user.getId()),
                TOKEN_TYPE,
                properties.accessTokenTtl().toSeconds(),
                UserProfileResponse.from(user));
        return new AuthResult<>(response, refreshToken.value(), properties.refreshTokenTtl());
    }

    @Transactional
    public AuthResult<TokenResponse> refresh(String refreshTokenValue) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            throw new BusinessException(ErrorCode.REFRESH_SESSION_INVALID);
        }

        Instant now = clock.instant();
        byte[] oldHash = refreshTokenService.hash(refreshTokenValue);
        AuthSession session = authSessionMapper.selectByRefreshTokenHash(oldHash);
        if (session == null || !session.getExpiresAt().isAfter(now)) {
            throw new BusinessException(ErrorCode.REFRESH_SESSION_INVALID);
        }

        User user = userMapper.selectOneById(session.getUserId());
        if (user == null) {
            throw new BusinessException(ErrorCode.REFRESH_SESSION_INVALID);
        }

        GeneratedRefreshToken newRefreshToken = refreshTokenService.generate();
        int updated = authSessionMapper.rotateRefreshToken(session.getId(), oldHash, newRefreshToken.hash(), now);
        if (updated != 1) {
            throw new BusinessException(ErrorCode.REFRESH_SESSION_INVALID);
        }

        TokenResponse response = new TokenResponse(
                jwtService.issueAccessToken(user.getId()),
                TOKEN_TYPE,
                properties.accessTokenTtl().toSeconds());
        return new AuthResult<>(response, newRefreshToken.value(), Duration.between(now, session.getExpiresAt()));
    }

    @Transactional
    public void logout(String refreshTokenValue) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            return;
        }
        authSessionMapper.deleteByRefreshTokenHash(refreshTokenService.hash(refreshTokenValue));
    }
}
