package com.superz.aivista.generation.service;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

/** Sends transient control commands to the single authenticated TypeScript runtime instance. */
@Component
public class AgentRuntimeCommandGateway {
    private final AtomicReference<WebSocketSession> runtime = new AtomicReference<>();
    private final JsonMapper json;

    public AgentRuntimeCommandGateway(JsonMapper json) {
        this.json = json;
    }

    void register(WebSocketSession session) {
        runtime.set(session);
    }

    void unregister(WebSocketSession session) {
        runtime.compareAndSet(session, null);
    }

    public boolean cancel(long creationTaskId, long revision) {
        WebSocketSession session = runtime.get();
        if (session == null || !session.isOpen()) return false;
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(json.writeValueAsString(Map.of(
                        "type", "CANCEL",
                        "creationTaskId", Long.toString(creationTaskId),
                        "revision", revision))));
            }
            return true;
        } catch (IOException exception) {
            unregister(session);
            return false;
        }
    }
}
