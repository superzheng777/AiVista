package com.superz.aivista.generation.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Shared service credential for Java-to-runtime internal HTTP and WebSocket connections. */
@ConfigurationProperties("app.generation.worker-api")
public record GenerationWorkerApiProperties(String token) {
}
