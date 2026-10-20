package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.superz.aivista.auth.token.AccessTokenClaims;
import com.superz.aivista.auth.token.JwtService;
import com.superz.aivista.generation.config.UserEventProperties;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.socket.*;
import tools.jackson.databind.json.JsonMapper;

class UserEventConnectionsTests {
    private final Instant now = Instant.parse("2026-10-20T00:00:00Z");
    private final JwtService jwt = mock(JwtService.class);
    private final CreationRuntimeStreamService runtime = mock(CreationRuntimeStreamService.class);
    private final GenerationConsentService consent = mock(GenerationConsentService.class);
    private final JsonMapper json = new JsonMapper();

    @SuppressWarnings("unchecked")
    private UserEventConnections service(int perUser, int total) {
        ObjectProvider<CreationRuntimeStreamService> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(runtime);
        when(jwt.parseAccessToken("a")).thenReturn(new AccessTokenClaims(1, "a", now, now.plusSeconds(60)));
        when(jwt.parseAccessToken("b")).thenReturn(new AccessTokenClaims(2, "b", now, now.plusSeconds(60)));
        when(consent.getCurrentConsent(anyLong())).thenReturn(new com.superz.aivista.generation.dto.GenerationConsentResponse("v1", "policy", true, now));
        return new UserEventConnections(new UserEventProperties(perUser, total, Duration.ofSeconds(15),
            Duration.ofSeconds(1), 100, Duration.ofSeconds(30)), Clock.fixed(now, ZoneOffset.UTC), jwt, json, provider, consent);
    }
    private WebSocketSession socket(String id) {
        WebSocketSession value = mock(WebSocketSession.class);
        when(value.getId()).thenReturn(id); when(value.isOpen()).thenReturn(true); return value;
    }
    private void authenticate(UserEventConnections service, WebSocketSession socket, String token) throws Exception {
        service.handleTextMessage(socket, new TextMessage("{\"type\":\"authenticate\",\"accessToken\":\"" + token + "\"}"));
    }

    @Test void onlyAuthenticatedOwnerReceivesCreationEvents() throws Exception {
        var service = service(3, 10); var a = socket("a"); var b = socket("b"); var pending = socket("pending");
        service.afterConnectionEstablished(a); service.afterConnectionEstablished(b); service.afterConnectionEstablished(pending);
        authenticate(service, a, "a"); authenticate(service, b, "b");
        clearInvocations(a, b, pending);
        service.broadcast(1, json.readTree("{\"type\":\"creation.text.delta\",\"delta\":\"你好\"}"));
        verify(a).sendMessage(argThat(message -> ((TextMessage) message).getPayload().contains("你好")));
        verify(b, never()).sendMessage(any()); verify(pending, never()).sendMessage(any());
        verify(runtime).restore(1); verify(runtime).restore(2);
    }

    @Test void duplicateUserLimitDoesNotCountSeparateCreations() throws Exception {
        var service = service(1, 3); var a = socket("a"); var duplicate = socket("a2");
        service.afterConnectionEstablished(a); authenticate(service, a, "a");
        service.handleTextMessage(a, new TextMessage("{\"type\":\"sync\",\"creationIds\":[\"11\",\"12\",\"13\"]}"));
        verify(runtime).watch(1, 11); verify(runtime).watch(1, 12); verify(runtime).watch(1, 13);
        service.afterConnectionEstablished(duplicate); authenticate(service, duplicate, "a");
        verify(duplicate).close(argThat(status -> status.getCode() == 1013));
        assertThat(service.activeConnectionCount()).isEqualTo(1);
    }

    @Test void requiresCurrentAgreementBeforeRestoringOrSendingEvents() throws Exception {
        var service = service(3, 10); var pending = socket("no-consent");
        when(consent.getCurrentConsent(1)).thenReturn(new com.superz.aivista.generation.dto.GenerationConsentResponse("v1", "policy", false, null));
        service.afterConnectionEstablished(pending); authenticate(service, pending, "a");
        verify(pending).close(CloseStatus.POLICY_VIOLATION); verifyNoInteractions(runtime);
        verify(pending, never()).sendMessage(any());
    }

    @Test void rejectsBusinessMessagesBeforeAuthenticationAndExpiredTokens() throws Exception {
        var service = service(3, 10); var pending = socket("pending");
        service.afterConnectionEstablished(pending);
        service.handleTextMessage(pending, new TextMessage("{\"type\":\"sync\",\"creationIds\":[\"11\"]}"));
        verify(pending).close(CloseStatus.POLICY_VIOLATION); verifyNoInteractions(runtime);
        var expired = socket("expired"); service.afterConnectionEstablished(expired);
        when(jwt.parseAccessToken("old")).thenThrow(new IllegalArgumentException("expired"));
        authenticate(service, expired, "old");
        verify(expired).close(argThat(status -> status.getCode() == 4001));
    }
}
