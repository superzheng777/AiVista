package com.superz.aivista.generation.dto;

import java.time.Instant;

/** 当前生成数据处理规则及当前用户的确认状态。 */
public record GenerationConsentResponse(
        String policyVersion,
        String policyContent,
        boolean consented,
        Instant consentedAt) {
}
