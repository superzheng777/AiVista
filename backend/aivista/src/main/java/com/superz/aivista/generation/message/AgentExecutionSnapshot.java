package com.superz.aivista.generation.message;

import java.util.List;
import java.util.Map;

/** TS 启动一个 Pi Loop 所需的最小权威快照。 */
public record AgentExecutionSnapshot(int contractVersion, String creationId, long revision,
        String status, String sessionId, String prompt, Map<String, Object> agentContext,
        List<InputAsset> inputAssets, GenerationConstraints constraints, PendingInput pendingInput) {

    public record GenerationConstraints(String aspectRatio, int imageCount) {
    }

    public record InputAsset(String assetId, String objectKey, String contentType,
            long fileSize, int width, int height) {
    }

    /** 可跨 Creation 恢复的待处理或最近处理输入。 */
    public record PendingInput(String creationId, String toolCallId, String status,
            Map<String, Object> form, Map<String, Object> answers) {
    }
}
