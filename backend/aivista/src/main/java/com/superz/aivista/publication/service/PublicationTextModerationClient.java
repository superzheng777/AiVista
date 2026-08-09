package com.superz.aivista.publication.service;

import com.aliyun.green20220302.Client;
import com.aliyun.green20220302.models.TextModerationPlusRequest;
import com.aliyun.green20220302.models.TextModerationPlusResponse;
import com.aliyun.green20220302.models.TextModerationPlusResponseBody;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.publication.config.PublicationModerationProperties;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class PublicationTextModerationClient {
    private final Client client;
    private final PublicationModerationProperties properties;
    private final ObjectMapper objectMapper;

    public PublicationTextModerationClient(Client publicationModerationClient,
            PublicationModerationProperties properties, ObjectMapper objectMapper) {
        this.client = publicationModerationClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public ModerationResult moderate(String content, String dataId) {
        try {
            TextModerationPlusRequest request = new TextModerationPlusRequest()
                    .setService(properties.service())
                    .setServiceParameters(objectMapper.writeValueAsString(Map.of(
                            "content", content,
                            "dataId", dataId)));
            TextModerationPlusResponse response = client.textModerationPlus(request);
            return resultOf(response == null ? null : response.getBody());
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot serialize publication moderation request", exception);
        } catch (Exception exception) {
            throw new PublicationTextModerationException(exception);
        }
    }

    private static ModerationResult resultOf(TextModerationPlusResponseBody response) {
        if (response == null || response.getCode() == null || response.getCode() != 200
                || response.getData() == null || response.getData().getRiskLevel() == null) {
            throw new IllegalStateException("Invalid publication moderation response");
        }
        List<String> labels = response.getData().getResult() == null ? List.of()
                : response.getData().getResult().stream()
                        .map(TextModerationPlusResponseBody.TextModerationPlusResponseBodyDataResult::getLabel)
                        .filter(label -> label != null && !label.isBlank())
                        .toList();
        return new ModerationResult(response.getRequestId(), response.getData().getRiskLevel(), labels);
    }

    public record ModerationResult(String requestId, String riskLevel, List<String> labels) {
        public boolean isAllowed() {
            return "none".equals(riskLevel) || "low".equals(riskLevel);
        }
    }
}
