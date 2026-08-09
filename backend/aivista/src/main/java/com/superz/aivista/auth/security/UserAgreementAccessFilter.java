package com.superz.aivista.auth.security;

import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.service.GenerationConsentService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

/** Blocks authenticated business requests until the current user agreement is confirmed. */
public class UserAgreementAccessFilter extends OncePerRequestFilter {
    private static final String AUTH_PATH_PREFIX = "/auth/";
    private static final String POLICY_PATH = "/policies/user-agreement";
    private static final String CONSENT_PATH = "/users/me/consents/user-agreement";

    private final GenerationConsentService consentService;
    private final JsonMapper jsonMapper;

    public UserAgreementAccessFilter(GenerationConsentService consentService, JsonMapper jsonMapper) {
        this.consentService = consentService;
        this.jsonMapper = jsonMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        String contextPath = request.getContextPath();
        String path = requestUri.startsWith(contextPath)
                ? requestUri.substring(contextPath.length())
                : requestUri;
        return HttpMethod.OPTIONS.matches(request.getMethod())
                || path.startsWith(AUTH_PATH_PREFIX)
                || POLICY_PATH.equals(path)
                || CONSENT_PATH.equals(path);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!consentService.getCurrentConsent(userId.longValue()).consented()) {
            response.setStatus(ErrorCode.GENERATION_CONSENT_REQUIRED.getHttpStatus().value());
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            jsonMapper.writeValue(response.getOutputStream(), ResponseUtils.error(ErrorCode.GENERATION_CONSENT_REQUIRED));
            return;
        }
        filterChain.doFilter(request, response);
    }
}
