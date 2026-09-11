package com.superz.aivista.generation.dto;

import java.util.List;

/** 启动一次短生命周期 Agent Loop；AUTO/0 表示对应生成参数由 Agent 决定。 */
public record CreateAgentCreationRequest(String sessionId, String prompt, List<String> inputAssetIds,
        String aspectRatio, Integer imageCount) {
}
