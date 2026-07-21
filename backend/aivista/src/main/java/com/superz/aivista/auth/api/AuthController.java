package com.superz.aivista.auth.api;

import com.superz.aivista.auth.config.AuthProperties;
import com.superz.aivista.auth.dto.LoginRequest;
import com.superz.aivista.auth.dto.LoginResponse;
import com.superz.aivista.auth.dto.RegisterRequest;
import com.superz.aivista.auth.dto.TokenResponse;
import com.superz.aivista.auth.service.AuthResult;
import com.superz.aivista.auth.service.AuthService;
import com.superz.aivista.auth.token.RefreshTokenCookieService;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.user.dto.UserProfileResponse;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 用户认证接口。 */
@Tag(name = "用户认证")
@RestController
@RequestMapping("/auth")
public class AuthController {
    private final AuthService authService;
    private final RefreshTokenCookieService cookieService;
    private final AuthProperties authProperties;

    public AuthController(
            AuthService authService,
            RefreshTokenCookieService cookieService,
            AuthProperties authProperties) {
        this.authService = authService;
        this.cookieService = cookieService;
        this.authProperties = authProperties;
    }

    @Operation(summary = "注册用户", description = "注册成功后不自动登录，客户端应继续调用登录接口。")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "注册成功"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "登录账号已存在"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "422", description = "请求参数校验失败")
    })
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<UserProfileResponse>> register(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(
                            mediaType = "application/json",
                            examples = @ExampleObject(value = """
                                    {
                                      "loginName": "alice_2026",
                                      "password": "Aivista2026",
                                      "nickname": "Alice"
                                    }
                                    """)))
            @Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ResponseUtils.success(authService.register(request)));
    }

    @Operation(summary = "用户登录", description = "登录成功后返回 Access Token，并通过 HttpOnly Cookie 写入 Refresh Token。")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "登录成功"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "登录账号或密码错误"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "422", description = "请求参数校验失败")
    })
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(
                            mediaType = "application/json",
                            examples = @ExampleObject(value = """
                                    {
                                      "loginName": "alice_2026",
                                      "password": "Aivista2026"
                                    }
                                    """)))
            @Valid @RequestBody LoginRequest request) {
        AuthResult<LoginResponse> result = authService.login(request);
        return withRefreshCookie(result);
    }

    @Operation(summary = "刷新访问令牌", description = "从 refresh_token HttpOnly Cookie 读取 Refresh Token，成功后轮换 Cookie 并返回新的 Access Token。")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "刷新成功"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Refresh Token 缺失、无效、过期或会话失效")
    })
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<TokenResponse>> refresh(
            @Parameter(description = "HttpOnly Cookie 中的 Refresh Token，由浏览器自动携带。")
            @CookieValue(name = "${app.auth.cookie.name}", required = false) String refreshToken) {
        try {
            AuthResult<TokenResponse> result = authService.refresh(refreshToken);
            return withRefreshCookie(result);
        } catch (BusinessException exception) {
            if (exception.getErrorCode() != ErrorCode.REFRESH_SESSION_INVALID) {
                throw exception;
            }
            return ResponseEntity.status(ErrorCode.REFRESH_SESSION_INVALID.getHttpStatus())
                    .header(HttpHeaders.SET_COOKIE, cookieService.clear().toString())
                    .body(new ApiResponse<>(
                            ErrorCode.REFRESH_SESSION_INVALID.getCode(),
                            exception.getMessage(),
                            null));
        }
    }

    @Operation(summary = "退出当前登录会话", description = "删除当前 Refresh Token 对应会话并清除 Cookie；Cookie 缺失时仍按成功处理。")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "退出成功")
    })
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @Parameter(description = "可选的 Refresh Token Cookie；缺失时仍清除 Cookie 并返回成功。")
            @CookieValue(name = "${app.auth.cookie.name}", required = false) String refreshToken) {
        authService.logout(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookieService.clear().toString())
                .body(ResponseUtils.success(null));
    }

    private <T> ResponseEntity<ApiResponse<T>> withRefreshCookie(AuthResult<T> result) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookieService.create(
                        result.refreshToken(),
                        result.refreshTokenTtl().compareTo(authProperties.refreshTokenTtl()) > 0
                                ? authProperties.refreshTokenTtl()
                                : result.refreshTokenTtl()).toString())
                .body(ResponseUtils.success(result.response()));
    }
}
