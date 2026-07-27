package com.superz.aivista.generation.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 文生图第三方数据处理规则的当前有效版本与展示文案。
 * 用户确认时会保存版本和文案 SHA-256 摘要，规则更新后以版本变化触发重新确认。
 */
@Validated
@ConfigurationProperties(prefix = "app.generation.consent")
public record GenerationConsentProperties(
        @NotBlank String policyVersion,
        @NotBlank String policyContent) {
}
