package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationWorkerApiProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class CreationRuntimeClient {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CreationRuntimeClient.class);
    // The Node internal server speaks HTTP/1.1; do not send an h2c Upgrade into its WS upgrade handler.
    private final HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5)).build();
    private final String baseUrl;
    private final GenerationWorkerApiProperties properties;
    private final JsonMapper json;
    private final ObjectProvider<CreationRuntimeStreamService> streams;

    public CreationRuntimeClient(@Value("${app.creation-runtime.base-url:http://127.0.0.1:8890}") String baseUrl,
            GenerationWorkerApiProperties properties, JsonMapper json, ObjectProvider<CreationRuntimeStreamService> streams) {
        this.baseUrl = baseUrl;
        this.properties = properties;
        this.json = json;
        this.streams = streams;
    }

    public JsonNode request(long userId, String method, String path, Object body) {
        try {
            var publisher = body == null ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body));
            var request = HttpRequest.newBuilder(URI.create(baseUrl + "/internal" + path))
                    .timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json")
                    .header("X-AiVista-Worker-Token", properties.token())
                    .header("X-AiVista-User-Id", Long.toString(userId)).method(method, publisher).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            var value = json.readTree(response.body());
            if (response.statusCode() >= 400) {
                String code = value.path("code").asText();
                log.warn("Creation runtime rejected {} {} with HTTP {} ({})", method, path, response.statusCode(), code);
                throw new BusinessException(switch (code) {
                    case "NOT_FOUND" -> ErrorCode.GENERATION_RESOURCE_NOT_FOUND;
                    case "SESSION_CREATION_LIMIT" -> ErrorCode.SESSION_CREATION_LIMIT;
                    case "SESSION_BUSY" -> ErrorCode.SESSION_CREATION_IN_PROGRESS;
                    case "REVISION_CONFLICT" -> ErrorCode.AGENT_FORM_CONFLICT;
                    default -> response.statusCode() == 400 ? ErrorCode.VALIDATION_ERROR : ErrorCode.SYSTEM_ERROR;
                });
            }
            try {
                if ("POST".equals(method) && "/creations".equals(path)) {
                    streams.getObject().watch(userId, Long.parseLong(value.path("turn").path("creationId").asText()));
                } else if ("PUT".equals(method) && path.startsWith("/creations/")) {
                    streams.getObject().watch(userId, Long.parseLong(path.split("/")[2]));
                } else if ("DELETE".equals(method) && path.startsWith("/generation-sessions/")) {
                    streams.getObject().forgetSession(userId, Long.parseLong(path.split("/")[2]));
                }
            } catch (RuntimeException exception) {
                // REST acceptance must not be reported as failed because the independent event connection failed.
                log.warn("Unable to subscribe to accepted creation events for user {}", userId, exception);
            }
            return value;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.SYSTEM_ERROR);
        } catch (java.io.IOException exception) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR);
        }
    }
}
