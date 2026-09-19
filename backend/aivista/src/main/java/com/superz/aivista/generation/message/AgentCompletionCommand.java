package com.superz.aivista.generation.message;

import com.fasterxml.jackson.databind.JsonNode;

/** TS Agent Worker 对一次 Creation 的确定性最终提交。 */
public record AgentCompletionCommand(int contractVersion,
        String creationId, long expectedRevision, String outcome, String failureCode, String finalMessage,
        java.util.List<AgentActivityItem> activities, JsonNode agentContext) {
}
