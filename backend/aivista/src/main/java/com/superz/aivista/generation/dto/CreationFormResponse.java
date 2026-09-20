package com.superz.aivista.generation.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

public record CreationFormResponse(String formId, String status, JsonNode form, JsonNode answers,
        Instant requestedAt, Instant resolvedAt) {
}
