package com.superz.aivista.generation.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record ResolveCreationFormRequest(Long expectedRevision, String action, JsonNode answers) {
}
