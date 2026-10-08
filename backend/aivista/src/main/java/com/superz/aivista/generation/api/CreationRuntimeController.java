package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationWorkerApiProperties;
import com.superz.aivista.generation.service.CreationImageService;
import com.superz.aivista.generation.service.GenerationSseConnectionService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/internal/creation-runtime")
public class CreationRuntimeController {
    private final GenerationWorkerApiProperties properties;
    private final CreationImageService images;
    private final GenerationSseConnectionService events;
    public CreationRuntimeController(GenerationWorkerApiProperties properties,
            CreationImageService images, GenerationSseConnectionService events) {
        this.properties = properties; this.images = images; this.events = events;
    }
    public record Events(List<JsonNode> events) {}

    @PostMapping("/events")
    public Map<String, Boolean> publish(@RequestHeader("X-AiVista-Worker-Token") String token, @RequestBody Events batch) {
        authenticate(token);
        for (var event : batch.events()) {
            String type = event.path("type").asText();
            if (!List.of("creation.updated", "creation.item.upserted").contains(type)) throw new IllegalArgumentException("Invalid event type");
            events.publishCreation(Long.parseLong(event.path("userId").asText()), type, images.signDisplay(event));
        }
        return Map.of("accepted", true);
    }
    private void authenticate(String token) {
        String expected = properties.token();
        if (expected == null || expected.isBlank() || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8)))
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
    }
}
