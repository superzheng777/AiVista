package com.superz.aivista.generation.config;

import com.superz.aivista.generation.service.UserEventConnections;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class UserWebSocketConfiguration implements WebSocketConfigurer {
    private final UserEventConnections connections;
    public UserWebSocketConfiguration(UserEventConnections connections) { this.connections = connections; }

    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        var origins = new ArrayList<String>();
        origins.add("http://localhost:3000"); origins.add("http://127.0.0.1:3000");
        try {
            for (var network : Collections.list(NetworkInterface.getNetworkInterfaces()))
                for (var address : Collections.list(network.getInetAddresses()))
                    if (address instanceof java.net.Inet4Address) origins.add("http://" + address.getHostAddress() + ":3000");
        } catch (java.net.SocketException exception) { throw new IllegalStateException("Cannot enumerate development origins", exception); }
        registry.addHandler(connections, "/ws/events").setAllowedOrigins(origins.toArray(String[]::new));
    }
}
