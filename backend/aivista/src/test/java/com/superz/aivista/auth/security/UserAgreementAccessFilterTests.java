package com.superz.aivista.auth.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.dto.GenerationConsentResponse;
import com.superz.aivista.generation.service.GenerationConsentService;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.json.JsonMapper;

class UserAgreementAccessFilterTests {
    private final GenerationConsentService consentService = mock(GenerationConsentService.class);
    private final UserAgreementAccessFilter filter =
            new UserAgreementAccessFilter(consentService, JsonMapper.builder().build());

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void blocksBusinessRequestWhenCurrentAgreementIsMissing() throws Exception {
        authenticate(7L);
        when(consentService.getCurrentConsent(7L))
                .thenReturn(new GenerationConsentResponse("v1", "policy", false, null));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(new MockHttpServletRequest("POST", "/generation-tasks"), response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(response.getContentAsString()).contains("\"code\":40903");
    }

    @Test
    void permitsAgreementConfirmationBeforeItIsAccepted() throws Exception {
        authenticate(7L);
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(new MockHttpServletRequest("POST", "/users/me/consents/user-agreement"),
                new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void permitsAgreementStatusQueryBeforeItIsAccepted() throws Exception {
        authenticate(7L);
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(new MockHttpServletRequest("GET", "/users/me/consents/user-agreement"),
                new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
    }

    @Test
    void permitsBusinessRequestAfterCurrentAgreementIsAccepted() throws Exception {
        authenticate(7L);
        when(consentService.getCurrentConsent(7L))
                .thenReturn(new GenerationConsentResponse("v1", "policy", true, Instant.parse("2026-08-09T00:00:00Z")));
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(new MockHttpServletRequest("POST", "/generation-images/9/publication"),
                new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
        verify(consentService).getCurrentConsent(7L);
    }

    private static void authenticate(long userId) {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(userId, null, java.util.List.of()));
    }
}
