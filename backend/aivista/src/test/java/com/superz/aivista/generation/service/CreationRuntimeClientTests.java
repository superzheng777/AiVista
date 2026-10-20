package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import com.sun.net.httpserver.HttpServer;
import com.superz.aivista.generation.config.GenerationWorkerApiProperties;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import tools.jackson.databind.json.JsonMapper;

class CreationRuntimeClientTests {
    @Test @SuppressWarnings("unchecked")
    void usesNodeHttpProtocolAndKeepsAcceptanceWhenSubscriptionFails() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var upgrade = new AtomicReference<String>();
        var token = new AtomicReference<String>();
        server.createContext("/internal/creations", exchange -> {
            upgrade.set(exchange.getRequestHeaders().getFirst("Upgrade"));
            token.set(exchange.getRequestHeaders().getFirst("X-AiVista-Worker-Token"));
            byte[] body = "{\"turn\":{\"creationId\":\"21\"}}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(202, body.length);
            exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            ObjectProvider<CreationRuntimeStreamService> provider = mock(ObjectProvider.class);
            var streams = mock(CreationRuntimeStreamService.class);
            when(provider.getObject()).thenReturn(streams);
            doThrow(new IllegalStateException("unavailable")).when(streams).watch(1, 21);
            var client = new CreationRuntimeClient("http://127.0.0.1:" + server.getAddress().getPort(),
                new GenerationWorkerApiProperties("internal-test"), new JsonMapper(), provider);
            var accepted = client.request(1, "POST", "/creations", java.util.Map.of());
            assertThat(accepted.path("turn").path("creationId").asText()).isEqualTo("21");
            assertThat(upgrade.get()).isNull();
            assertThat(token.get()).isEqualTo("internal-test");
            verify(streams).watch(1, 21);
        } finally { server.stop(0); }
    }
}
