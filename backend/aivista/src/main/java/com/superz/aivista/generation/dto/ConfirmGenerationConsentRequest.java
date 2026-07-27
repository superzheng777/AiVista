package com.superz.aivista.generation.dto;

import jakarta.validation.constraints.NotBlank;

/** 用户确认当前第三方数据处理规则时提交的版本。 */
public record ConfirmGenerationConsentRequest(@NotBlank String policyVersion) {
}
