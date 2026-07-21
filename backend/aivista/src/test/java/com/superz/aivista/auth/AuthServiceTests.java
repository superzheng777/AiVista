package com.superz.aivista.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.auth.dto.LoginRequest;
import com.superz.aivista.auth.dto.RegisterRequest;
import com.superz.aivista.auth.entity.AuthSession;
import com.superz.aivista.auth.mapper.AuthSessionMapper;
import com.superz.aivista.auth.service.AuthService;
import com.superz.aivista.auth.token.GeneratedRefreshToken;
import com.superz.aivista.auth.token.JwtService;
import com.superz.aivista.auth.token.RefreshTokenService;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceTests {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-20T00:00:00Z"), ZoneOffset.UTC);

    private final UserMapper userMapper = mock(UserMapper.class);
    private final AuthSessionMapper authSessionMapper = mock(AuthSessionMapper.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final JwtService jwtService = mock(JwtService.class);
    private final RefreshTokenService refreshTokenService = mock(RefreshTokenService.class);
    private final AuthService authService = new AuthService(
            userMapper,
            authSessionMapper,
            passwordEncoder,
            jwtService,
            refreshTokenService,
            TestAuthProperties.create(),
            CLOCK);

    @Test
    void registerNormalizesLoginNameAndConvertsDuplicateAccount() {
        doThrow(new DuplicateKeyException("duplicate"))
                .when(userMapper).insertSelective(any(User.class));

        assertBusinessError(
                () -> authService.register(new RegisterRequest("  Alice_2026  ", "Aivista2026", "Alice")),
                ErrorCode.LOGIN_NAME_EXISTS);
    }

    @Test
    void registerRejectsInvalidPasswordBeforeWritingUser() {
        assertBusinessError(
                () -> authService.register(new RegisterRequest("alice_2026", "password", "Alice")),
                ErrorCode.VALIDATION_ERROR);

        verify(userMapper, never()).insertSelective(any(User.class));
    }

    @Test
    void registerEncodesPasswordAndReturnsCreatedProfile() {
        AtomicReference<User> inserted = new AtomicReference<>();
        when(passwordEncoder.encode("Aivista2026")).thenReturn("encoded-password");
        doAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(7L);
            inserted.set(user);
            return 1;
        }).when(userMapper).insertSelective(any(User.class));
        when(userMapper.selectOneById(7L)).thenAnswer(invocation -> inserted.get());

        var response = authService.register(new RegisterRequest("  Alice_2026  ", "Aivista2026", "  Alice  "));

        assertThat(response.id()).isEqualTo("7");
        assertThat(response.loginName()).isEqualTo("Alice_2026");
        assertThat(response.nickname()).isEqualTo("Alice");
        assertThat(inserted.get().getPasswordHash()).isEqualTo("encoded-password");
    }

    @Test
    void loginUsesUnifiedFailureWhenUserMissingOrPasswordWrong() {
        assertBusinessError(
                () -> authService.login(new LoginRequest("missing", "Aivista2026")),
                ErrorCode.LOGIN_FAILED);

        User user = user(1L);
        when(userMapper.selectByLoginName("alice")).thenReturn(user);
        when(passwordEncoder.matches("wrong-password", user.getPasswordHash())).thenReturn(false);

        assertBusinessError(
                () -> authService.login(new LoginRequest("alice", "wrong-password")),
                ErrorCode.LOGIN_FAILED);
    }

    @Test
    void refreshMissingSessionOrFailedRotationUsesRefreshInvalidError() {
        assertBusinessError(() -> authService.refresh(null), ErrorCode.REFRESH_SESSION_INVALID);

        byte[] oldHash = new byte[] {1};
        when(refreshTokenService.hash("old-refresh-token")).thenReturn(oldHash);
        assertBusinessError(
                () -> authService.refresh("old-refresh-token"),
                ErrorCode.REFRESH_SESSION_INVALID);

        AuthSession session = new AuthSession();
        session.setId(10L);
        session.setUserId(1L);
        session.setExpiresAt(CLOCK.instant().plusSeconds(60));
        when(authSessionMapper.selectByRefreshTokenHash(oldHash)).thenReturn(session);
        when(userMapper.selectOneById(1L)).thenReturn(user(1L));
        when(refreshTokenService.generate()).thenReturn(new GeneratedRefreshToken("new-refresh-token", new byte[] {2}));
        when(authSessionMapper.rotateRefreshToken(eq(10L), eq(oldHash), any(byte[].class), eq(CLOCK.instant())))
                .thenReturn(0);

        assertBusinessError(
                () -> authService.refresh("old-refresh-token"),
                ErrorCode.REFRESH_SESSION_INVALID);
    }

    @Test
    void logoutWithoutCookieDoesNothing() {
        authService.logout(" ");

        verify(refreshTokenService, never()).hash(any());
        verify(authSessionMapper, never()).deleteByRefreshTokenHash(any());
    }

    private static User user(long id) {
        User user = new User();
        user.setId(id);
        user.setLoginName("alice");
        user.setPasswordHash("encoded-password");
        user.setNickname("Alice");
        return user;
    }

    private static void assertBusinessError(Runnable action, ErrorCode errorCode) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(errorCode));
    }
}
