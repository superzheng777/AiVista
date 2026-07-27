package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationConsentProperties;
import com.superz.aivista.generation.entity.UserConsent;
import com.superz.aivista.generation.mapper.UserConsentMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class GenerationConsentServiceTests {
    private static final Instant NOW = Instant.parse("2026-07-27T12:00:00Z");
    private static final GenerationConsentProperties PROPERTIES =
            new GenerationConsentProperties("2026-07-27-v1", "Current policy content");

    private final UserConsentMapper mapper = mock(UserConsentMapper.class);
    private final GenerationConsentService service = new GenerationConsentService(
            mapper, PROPERTIES, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void returnsUnconfirmedWhenThereIsNoRecord() {
        var response = service.getCurrentConsent(7L);

        assertThat(response.policyVersion()).isEqualTo("2026-07-27-v1");
        assertThat(response.policyContent()).isEqualTo("Current policy content");
        assertThat(response.consented()).isFalse();
        assertThat(response.consentedAt()).isNull();
    }

    @Test
    void confirmsOnlyTheCurrentPolicyVersion() {
        var response = service.confirmCurrentConsent(7L, "2026-07-27-v1");

        assertThat(response.consented()).isTrue();
        assertThat(response.consentedAt()).isEqualTo(NOW);
        verify(mapper).upsert(org.mockito.ArgumentMatchers.eq(7L),
                org.mockito.ArgumentMatchers.eq("GENERATION_THIRD_PARTY_PROCESSING"),
                org.mockito.ArgumentMatchers.eq("2026-07-27-v1"), any(), org.mockito.ArgumentMatchers.eq(NOW));
    }

    @Test
    void rejectsAnOutdatedPolicyVersionWithoutWritingARecord() {
        assertThatThrownBy(() -> service.confirmCurrentConsent(7L, "old-version"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.GENERATION_CONSENT_VERSION_OUTDATED));
    }

    @Test
    void treatsARecordWithDifferentContentHashAsUnconfirmed() {
        UserConsent consent = new UserConsent();
        consent.setPolicyVersion("2026-07-27-v1");
        consent.setPolicyContentHash("not-the-current-hash");
        consent.setConsentedAt(NOW);
        when(mapper.selectByUserIdAndConsentType(7L, "GENERATION_THIRD_PARTY_PROCESSING")).thenReturn(consent);

        assertThat(service.getCurrentConsent(7L).consented()).isFalse();
    }
}
