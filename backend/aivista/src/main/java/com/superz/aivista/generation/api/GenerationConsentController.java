package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.ConfirmGenerationConsentRequest;
import com.superz.aivista.generation.dto.GenerationConsentResponse;
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
@Tag(name = "文生图规则确认")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/users/me/consents/generation")
public class GenerationConsentController {
    private final GenerationConsentService generationConsentService;

    public GenerationConsentController(GenerationConsentService generationConsentService) {
        this.generationConsentService = generationConsentService;
    }

    @Operation(summary = "查询文生图第三方数据处理规则", description = "返回当前规则全文、版本及当前用户的确认状态。")
    @GetMapping
    public ApiResponse<GenerationConsentResponse> getCurrentConsent(Authentication authentication) {
        return ResponseUtils.success(generationConsentService.getCurrentConsent(currentUserId(authentication)));
    }

    @Operation(summary = "确认文生图第三方数据处理规则", description = "仅接受当前有效规则版本；版本更新后需重新确认。")
    @PostMapping
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
