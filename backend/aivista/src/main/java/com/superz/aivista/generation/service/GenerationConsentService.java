package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationConsentProperties;
import com.superz.aivista.generation.dto.GenerationConsentResponse;
import com.superz.aivista.generation.entity.UserConsent;
import com.superz.aivista.generation.mapper.UserConsentMapper;
import com.superz.aivista.generation.model.ConsentType;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 管理用户对当前文生图第三方数据处理规则的确认。 */
@Service
public class GenerationConsentService {
    private static final ConsentType CONSENT_TYPE = ConsentType.USER_AGREEMENT;

    private final UserConsentMapper userConsentMapper;
    private final GenerationConsentProperties properties;
    private final Clock clock;

    public GenerationConsentService(
            UserConsentMapper userConsentMapper,
            GenerationConsentProperties properties,
            Clock clock) {
        this.userConsentMapper = userConsentMapper;
        this.properties = properties;
        this.clock = clock;
    }

    public GenerationConsentResponse getCurrentConsent(long userId) {
        UserConsent consent = userConsentMapper.selectByUserIdAndConsentType(userId, CONSENT_TYPE.name());
        boolean consented = consent != null
                && properties.policyVersion().equals(consent.getPolicyVersion())
                && currentContentHash().equals(consent.getPolicyContentHash());
        return new GenerationConsentResponse(
                properties.policyVersion(), properties.policyContent(), consented,
                consented ? consent.getConsentedAt() : null);
    }

    @Transactional
    public GenerationConsentResponse confirmCurrentConsent(long userId, String policyVersion) {
        if (!properties.policyVersion().equals(policyVersion)) {
            throw new BusinessException(ErrorCode.GENERATION_CONSENT_VERSION_OUTDATED);
        }

        Instant consentedAt = clock.instant();
        userConsentMapper.upsert(
                userId, CONSENT_TYPE.name(), properties.policyVersion(), currentContentHash(), consentedAt);
        return new GenerationConsentResponse(
                properties.policyVersion(), properties.policyContent(), true, consentedAt);
    }

    private String currentContentHash() {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(properties.policyContent().getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }
}
