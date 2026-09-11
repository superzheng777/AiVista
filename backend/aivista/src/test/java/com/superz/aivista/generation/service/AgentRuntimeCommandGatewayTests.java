package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

class AgentRuntimeCommandGatewayTests {
    private final AgentRuntimeCommandGateway gateway = new AgentRuntimeCommandGateway(JsonMapper.builder().build());

    @Test
    void sendsCancellationToTheAuthenticatedRuntime() throws Exception {
        WebSocketSession session = Mockito.mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
        gateway.register(session);

        assertThat(gateway.cancel(31L, 5L)).isTrue();

        ArgumentCaptor<TextMessage> message = ArgumentCaptor.forClass(TextMessage.class);
        verify(session).sendMessage(message.capture());
        assertThat(message.getValue().getPayload()).contains("\"type\":\"CANCEL\"")
                .contains("\"creationTaskId\":\"31\"").contains("\"revision\":5");
    }
}
