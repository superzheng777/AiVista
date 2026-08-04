package com.superz.aivista.generation.dto;

/** 创建普通文生图任务时由客户端提交的可选参数。 */
public record CreateGenerationTaskRequest(
        /** 可选；缺省时由本次首次提交创建持久化会话。 */
        String sessionId,
        /** 当前轮用户填写的正向提示词，服务端会结合历史消息生成最终模型输入。 */
        String prompt,
        /** 可选；仅空白时规范化为 null，避免空字符串影响幂等请求指纹。 */
        String negativePrompt,
        /** 服务端白名单中的画幅标识，不直接接收宽高。 */
        String aspectRatio,
        Boolean promptExtend,
        /** 本次请求的图片数量，最终以服务端模型能力配置校验。 */
        Integer imageCount) {
}
