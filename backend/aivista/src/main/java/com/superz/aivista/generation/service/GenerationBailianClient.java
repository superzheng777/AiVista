package com.superz.aivista.generation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import java.util.List;
import java.util.Map;
import java.net.ConnectException;
import java.net.UnknownHostException;
import javax.net.ssl.SSLHandshakeException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.ResourceAccessException;

/** 按百炼 Qwen-Image 同步接口发起一次生成并提取临时图片 URL。 */
@Service
public class GenerationBailianClient {
    private final RestClient restClient;
    private final GenerationBailianProperties properties;
    private final ObjectMapper objectMapper;

    /** 注入已设置 Endpoint 和超时的 HTTP 客户端及百炼凭证配置。 */
    public GenerationBailianClient(RestClient generationBailianRestClient,
            GenerationBailianProperties properties, ObjectMapper objectMapper) {
        this.restClient = generationBailianRestClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /** 将任务中的最终提示词和已校验参数发送给百炼，并提取临时图片 URL。 */
    public ProviderResult generate(GenerationTask task) {
        Map<String, Object> request = Map.of(
                "model", task.getModel().replace("bailian/", ""),
                "input", Map.of("messages", List.of(Map.of(
                        "role", "user", "content", List.of(Map.of("text", task.getFinalPrompt()))))),
                "parameters", Map.of(
                        "negative_prompt", task.getFinalNegativePrompt() == null ? "" : task.getFinalNegativePrompt(),
                        "size", task.getWidth() + "*" + task.getHeight(),
                        "n", task.getRequestedImageCount(),
                        "prompt_extend", false,
                        "watermark", false));
        try {
            BailianGenerationResponse response = restClient.post()
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + properties.apiKey())
                    .header("X-DashScope-Wait-Timeout", "30")
                    .body(request)
                    .retrieve()
                    .body(BailianGenerationResponse.class);
            ProviderResult result = resultFrom(response, toJson(response));
            if (result.imageUrls().size() != task.getRequestedImageCount()) {
                throw new BailianProviderException(200, null, result.requestId(),
                        "Bailian image URL count does not match the request");
            }
            return result;
        } catch (RestClientResponseException exception) {
            throw providerException(exception.getStatusCode().value(), exception.getResponseBodyAsString());
        } catch (ResourceAccessException exception) {
            if (isConnectionNotEstablished(exception)) {
                throw new BailianConnectionException(exception);
            }
            throw exception;
        }
    }

    /** 从已落库的百炼响应快照恢复 URL，避免重投消息时再次生成图片。 */
    public ProviderResult restore(String snapshot) {
        try {
            return resultFrom(objectMapper.readValue(snapshot, BailianGenerationResponse.class), snapshot);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot restore Bailian response snapshot", exception);
        }
    }

    /** 将完整响应序列化为仅供恢复 OSS 转存使用的内部快照。 */
    private String toJson(BailianGenerationResponse response) {
        try {
            return objectMapper.writeValueAsString(response);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot serialize Bailian response snapshot", exception);
        }
    }

    /** 校验成功响应的结束原因、用量和图片 URL，并转换为内部结果。 */
    private ProviderResult resultFrom(BailianGenerationResponse response, String snapshot) {
        if (response == null) {
            throw new BailianProviderException(200, null, null, "Empty Bailian response");
        }
        if (response.code() != null && !response.code().isBlank()) {
            throw new BailianProviderException(200, response.code(), response.requestId(), response.message());
        }
        List<BailianGenerationResponse.Choice> choices = response.output() == null ? List.of() : response.output().choices();
        if (choices == null || choices.size() != 1 || !"stop".equals(choices.getFirst().finishReason())
                || choices.getFirst().message() == null || choices.getFirst().message().content() == null) {
            throw new BailianProviderException(200, null, response.requestId(), "Unexpected Bailian success response");
        }
        List<String> imageUrls = choices.getFirst().message().content().stream()
                .map(BailianGenerationResponse.Content::image).filter(value -> value != null && !value.isBlank()).toList();
        if (imageUrls.isEmpty() || response.usage() == null || response.usage().width() == null
                || response.usage().height() == null) {
            throw new BailianProviderException(200, null, response.requestId(), "Invalid Bailian success usage");
        }
        return new ProviderResult(response.requestId(), imageUrls, response.usage().imageCount(),
                response.usage().width(), response.usage().height(), snapshot);
    }

    /** 将非 2xx 响应体尽量恢复为官方错误字段，保留给服务端失败分类。 */
    private BailianProviderException providerException(int httpStatus, String body) {
        try {
            BailianGenerationResponse response = objectMapper.readValue(body, BailianGenerationResponse.class);
            return new BailianProviderException(httpStatus, response.code(), response.requestId(), response.message());
        } catch (Exception ignored) {
            return new BailianProviderException(httpStatus, null, null, "Unparseable Bailian error response");
        }
    }

    private static boolean isConnectionNotEstablished(Throwable exception) {
        for (Throwable current = exception; current != null; current = current.getCause()) {
            if (current instanceof UnknownHostException || current instanceof ConnectException
                    || current instanceof SSLHandshakeException) {
                return true;
            }
        }
        return false;
    }

    public record ProviderResult(String requestId, List<String> imageUrls, Integer declaredImageCount,
            Integer declaredWidth, Integer declaredHeight, String snapshot) {
    }
}
