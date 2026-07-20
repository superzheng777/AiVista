package com.superz.aivista.auth.security;

import com.superz.aivista.auth.token.AccessTokenClaims;
import com.superz.aivista.auth.token.InvalidAccessTokenException;
import com.superz.aivista.auth.token.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.web.filter.OncePerRequestFilter;

/** Validates Bearer Access Tokens and exposes the authenticated user ID for the current request. */
public class AccessTokenAuthenticationFilter extends OncePerRequestFilter {
    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final AuthenticationFailureHandler failureHandler;

    public AccessTokenAuthenticationFilter(JwtService jwtService, AuthenticationFailureHandler failureHandler) {
        this.jwtService = jwtService;
        this.failureHandler = failureHandler;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String authorization = request.getHeader(AUTHORIZATION_HEADER);
        if (authorization == null) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!authorization.startsWith(BEARER_PREFIX) || authorization.length() == BEARER_PREFIX.length()) {
            failureHandler.onAuthenticationFailure(
                    request, response, new BadCredentialsException("Access Token is missing"));
            return;
        }

        try {
            AccessTokenClaims claims = jwtService.parseAccessToken(authorization.substring(BEARER_PREFIX.length()));
            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                var authentication = UsernamePasswordAuthenticationToken.authenticated(
                        claims.userId(), null, List.of());
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
            filterChain.doFilter(request, response);
        } catch (InvalidAccessTokenException exception) {
            failureHandler.onAuthenticationFailure(
                    request, response, new BadCredentialsException("Access Token is invalid"));
        }
    }
}
