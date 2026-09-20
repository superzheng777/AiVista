package com.superz.aivista.generation.message;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record AgentInputRequestCommand(int contractVersion, long expectedRevision,
        JsonNode form, List<AgentActivityItem> activities) {
}
