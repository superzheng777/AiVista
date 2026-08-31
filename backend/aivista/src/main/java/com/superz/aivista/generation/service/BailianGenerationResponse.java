package com.superz.aivista.generation.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** 百炼 Qwen-Image 同步接口的响应 DTO；未知字段保留给服务商后续扩展。 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record BailianGenerationResponse(
        @JsonProperty("request_id") String requestId,
        String code,
        String message,
        Output output,
        Usage usage) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Output(List<Choice> choices) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Choice(@JsonProperty("finish_reason") String finishReason, Message message) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Message(List<Content> content) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Content(String image) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Usage(
            @JsonProperty("image_count") @JsonAlias("output_image_count") Integer imageCount,
            @JsonProperty("width") @JsonAlias("output_width") Integer width,
            @JsonProperty("height") @JsonAlias("output_height") Integer height) { }
}
