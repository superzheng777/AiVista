package com.superz.aivista.generation.dto;

import java.util.List;

/** 创建普通文生图任务时由客户端提交的可选参数。 */
public record CreateGenerationTaskRequest(
        /** 可选；缺省时由本次首次提交创建持久化会话。 */
        String sessionId,
        /** 当前轮用户填写的正向提示词，单次生成仅使用本轮输入。 */
        String prompt,
        /** 可选的参考图片资产；0张为文生图，1至3张为图生图，数组顺序即图1至图3。 */
        List<String> inputAssetIds,
        /** 可选；仅空白时规范化为 null，避免空字符串影响幂等请求指纹。 */
        String negativePrompt,
        /** 服务端白名单中的画幅标识，不直接接收宽高。 */
        String aspectRatio,
        Boolean promptExtend,
        /** 本次请求的图片数量，最终以服务端模型能力配置校验。 */
        Integer imageCount) {

    /** 保持现有文生图调用方的二进制源代码构造形式兼容。 */
    public CreateGenerationTaskRequest(String sessionId, String prompt, String negativePrompt,
            String aspectRatio, Boolean promptExtend, Integer imageCount) {
        this(sessionId, prompt, null, negativePrompt, aspectRatio, promptExtend, imageCount);
    }
}
