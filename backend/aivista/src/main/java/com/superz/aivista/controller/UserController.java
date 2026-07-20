package com.superz.aivista.controller;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.user.dto.UpdateProfileRequest;
import com.superz.aivista.user.dto.UserProfileResponse;
import com.superz.aivista.user.service.UserProfileService;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 当前用户个人资料接口。 */
@Tag(name = "个人资料")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/users/me")
public class UserController {
    private final UserProfileService userProfileService;

    public UserController(UserProfileService userProfileService) {
        this.userProfileService = userProfileService;
    }

    @Operation(summary = "查询当前用户资料", description = "使用 Authorization Bearer Access Token 查询当前登录用户资料。")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "查询成功"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "未登录或登录已失效")
    })
    @GetMapping
    public ApiResponse<UserProfileResponse> me(Authentication authentication) {
        return ResponseUtils.success(userProfileService.getCurrentUser(currentUserId(authentication)));
    }

    @Operation(summary = "修改当前用户资料", description = "完整提交当前用户可修改资料。媒体归属能力落地前，avatarUrl 仅允许为 null 或保持当前值。")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "修改成功"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "未登录或登录已失效"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "无权使用该媒体文件"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "422", description = "请求参数校验失败")
    })
    @PutMapping
    public ApiResponse<UserProfileResponse> updateMe(
            Authentication authentication,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    content = @Content(
                            mediaType = "application/json",
                            examples = @ExampleObject(value = """
                                    {
                                      "nickname": "Alice",
                                      "avatarUrl": null,
                                      "bio": "AI image creator"
                                    }
                                    """)))
            @Valid @RequestBody UpdateProfileRequest request) {
        return ResponseUtils.success(userProfileService.updateCurrentUser(currentUserId(authentication), request));
    }

    private long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
