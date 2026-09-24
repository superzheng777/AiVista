package com.superz.aivista.generation.model;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

/** Keeps dynamic Agent JSON on HTTP records as ordinary maps while services use Jackson 2 trees internally. */
public final class AgentJsonObjects {
    private static final TypeReference<Map<String, Object>> OBJECT_TYPE = new TypeReference<>() {};

    private AgentJsonObjects() {}

    public static JsonNode toTree(ObjectMapper mapper, Map<String, Object> value) {
        return value == null ? null : mapper.valueToTree(value);
    }

    public static Map<String, Object> read(ObjectMapper mapper, String value, String description) {
        if (value == null) return null;
        try {
            JsonNode tree = mapper.readTree(value);
            if (tree == null || !tree.isObject()) throw new IllegalStateException(description + " must be an object");
            return mapper.convertValue(tree, OBJECT_TYPE);
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            throw new IllegalStateException(description + " is invalid", exception);
        }
    }
}
