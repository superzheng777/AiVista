package com.superz.aivista.generation.message;

import java.util.List;
import java.util.Map;

public record AgentInputRequestCommand(int contractVersion, long expectedRevision,
        Map<String, Object> agentContext, Map<String, Object> form, List<AgentActivityItem> activities) {
}
