package com.superz.aivista.generation.dto;

import java.util.Map;

public record ResolveCreationFormRequest(Long expectedRevision, String action, Map<String, Object> form) {
}
