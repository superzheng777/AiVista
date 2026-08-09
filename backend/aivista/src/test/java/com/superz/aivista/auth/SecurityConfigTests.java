package com.superz.aivista.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.superz.aivista.auth.security.RestAccessDeniedHandler;
import com.superz.aivista.auth.security.RestAuthenticationFailureHandler;
import com.superz.aivista.auth.security.SecurityConfig;
import com.superz.aivista.auth.token.JwtService;
import com.superz.aivista.generation.service.GenerationConsentService;
import jakarta.servlet.DispatcherType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import tools.jackson.databind.json.JsonMapper;

@SpringJUnitConfig
@WebAppConfiguration
@ContextConfiguration(classes = {SecurityConfig.class, SecurityConfigTests.TestBeans.class})
class SecurityConfigTests {

    @Autowired
    private FilterChainProxy securityFilterChain;

    @Test
    void permitsAuthenticatedRequestAsyncContinuationWithoutASecondAuthentication() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/events");
        request.setDispatcherType(DispatcherType.ASYNC);
        MockHttpServletResponse response = new MockHttpServletResponse();

        securityFilterChain.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void permitsErrorDispatchAfterTheEventStreamResponseIsCommitted() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/events");
        request.setDispatcherType(DispatcherType.ERROR);
        MockHttpServletResponse response = new MockHttpServletResponse();

        securityFilterChain.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void stillRejectsAnUnauthenticatedInitialRequest() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/events");
        MockHttpServletResponse response = new MockHttpServletResponse();

        securityFilterChain.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Configuration
    static class TestBeans {
        @Bean
        JwtService jwtService() {
            return mock(JwtService.class);
        }

        @Bean
        RestAuthenticationFailureHandler authenticationFailureHandler() {
            return new RestAuthenticationFailureHandler(jsonMapper());
        }

        @Bean
        RestAccessDeniedHandler accessDeniedHandler() {
            return new RestAccessDeniedHandler(jsonMapper());
        }

        @Bean
        JsonMapper jsonMapper() {
            return JsonMapper.builder().build();
        }

        @Bean
        GenerationConsentService consentService() {
            return mock(GenerationConsentService.class);
        }
    }
}
