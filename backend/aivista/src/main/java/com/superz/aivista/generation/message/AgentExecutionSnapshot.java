package com.superz.aivista.generation.message;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/** TS 启动一个 Pi Loop 所需的最小权威快照。 */
public record AgentExecutionSnapshot(int contractVersion, String creationId, long revision,
        String status, String sessionId, String prompt, JsonNode agentContext,
        List<InputAsset> inputAssets, GenerationConstraints constraints) {

    public record GenerationConstraints(String aspectRatio, int imageCount) {
    }

    public record InputAsset(String assetId, String objectKey, String contentType,
            long fileSize, int width, int height) {
    }
}
