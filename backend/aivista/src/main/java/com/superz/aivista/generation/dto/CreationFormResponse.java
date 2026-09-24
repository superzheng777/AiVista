package com.superz.aivista.generation.dto;

import java.time.Instant;
import java.util.Map;

public record CreationFormResponse(String formId, String toolCallId, String status,
        Map<String, Object> form, Map<String, Object> answers,
        Instant requestedAt, Instant resolvedAt) {
}
