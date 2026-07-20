package com.superz.aivista.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.superz.aivista.auth.security.AccessTokenAuthenticationFilter;
import com.superz.aivista.auth.security.RestAuthenticationFailureHandler;
import com.superz.aivista.auth.token.JwtService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.json.JsonMapper;

class AccessTokenAuthenticationFilterTests {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void authenticatesAValidBearerAccessToken() throws Exception {
        JwtService jwtService = new JwtService(
                TestAuthProperties.create(), Clock.fixed(Instant.parse("2026-07-20T00:00:00Z"), ZoneOffset.UTC));
        AccessTokenAuthenticationFilter filter = new AccessTokenAuthenticationFilter(
                jwtService, new RestAuthenticationFailureHandler(JsonMapper.builder().build()));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/users/me");
        request.addHeader("Authorization", "Bearer " + jwtService.issueAccessToken(42L));

        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isEqualTo(42L);
    }

    @Test
    void returnsTheUnifiedUnauthorizedResponseForAnInvalidBearerAccessToken() throws Exception {
        JwtService jwtService = new JwtService(
                TestAuthProperties.create(), Clock.fixed(Instant.parse("2026-07-20T00:00:00Z"), ZoneOffset.UTC));
        AccessTokenAuthenticationFilter filter = new AccessTokenAuthenticationFilter(
                jwtService, new RestAuthenticationFailureHandler(JsonMapper.builder().build()));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/users/me");
        request.addHeader("Authorization", "Bearer invalid-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("\"code\":40100");
    }
}
