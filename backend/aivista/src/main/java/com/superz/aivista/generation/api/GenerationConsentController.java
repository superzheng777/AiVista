package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.ConfirmGenerationConsentRequest;
import com.superz.aivista.generation.dto.GenerationConsentResponse;
import com.superz.aivista.generation.dto.UserAgreementPolicyResponse;
import com.superz.aivista.generation.service.GenerationConsentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 文生图第三方数据处理规则确认接口。 */
@Tag(name = "用户协议")
@RestController
public class GenerationConsentController {
    private final GenerationConsentService generationConsentService;

    public GenerationConsentController(GenerationConsentService generationConsentService) {
        this.generationConsentService = generationConsentService;
    }

    @Operation(summary = "查询当前用户协议", description = "注册与登录后强制确认弹窗使用的公开协议全文及版本。")
    @GetMapping("/policies/user-agreement")
    public ApiResponse<UserAgreementPolicyResponse> getCurrentPolicy() {
        return ResponseUtils.success(generationConsentService.getCurrentPolicy());
    }

    @Operation(summary = "确认当前用户协议", description = "仅接受当前有效规则版本；版本更新后需重新确认。")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/users/me/consents/user-agreement")
    public ApiResponse<GenerationConsentResponse> confirmCurrentConsent(
            Authentication authentication,
            @Valid @RequestBody ConfirmGenerationConsentRequest request) {
        return ResponseUtils.success(generationConsentService.confirmCurrentConsent(
                currentUserId(authentication), request.policyVersion()));
    }

    private long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
