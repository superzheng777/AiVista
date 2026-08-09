package com.superz.aivista.publication.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.aliyun.green20220302.Client;
import com.aliyun.green20220302.models.TextModerationPlusResponse;
import com.aliyun.green20220302.models.TextModerationPlusResponseBody;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.publication.config.PublicationModerationProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class PublicationTextModerationClientTests {
    private final Client greenClient = org.mockito.Mockito.mock(Client.class);
    private final PublicationTextModerationClient client = new PublicationTextModerationClient(greenClient,
            new PublicationModerationProperties("green-cip.cn-shanghai.aliyuncs.com",
                    "ugc_moderation_byllm_pro", Duration.ofSeconds(5), Duration.ofSeconds(30)),
            new ObjectMapper());

    @Test
    void allowsNoneRiskAndSendsPublicationDataId() throws Exception {
        when(greenClient.textModerationPlus(any())).thenReturn(response("none", List.of()));

        var result = client.moderate("cyberpunk cat", "publication-42");

        ArgumentCaptor<com.aliyun.green20220302.models.TextModerationPlusRequest> request =
                ArgumentCaptor.forClass(com.aliyun.green20220302.models.TextModerationPlusRequest.class);
        org.mockito.Mockito.verify(greenClient).textModerationPlus(request.capture());
        assertThat(request.getValue().getService()).isEqualTo("ugc_moderation_byllm_pro");
        assertThat(request.getValue().getServiceParameters())
                .contains("cyberpunk cat", "publication-42");
        assertThat(result.isAllowed()).isTrue();
        assertThat(result.labels()).isEmpty();
    }

    @Test
    void rejectsMediumRiskAndRetainsLabels() throws Exception {
        when(greenClient.textModerationPlus(any())).thenReturn(response("medium", List.of("sexual_suggestive_hint")));

        var result = client.moderate("content", "publication-42");

        assertThat(result.isAllowed()).isFalse();
        assertThat(result.labels()).containsExactly("sexual_suggestive_hint");
    }

    @Test
    void wrapsProviderFailure() throws Exception {
        when(greenClient.textModerationPlus(any())).thenThrow(new RuntimeException("network failure"));

        assertThatThrownBy(() -> client.moderate("content", "publication-42"))
                .isInstanceOf(PublicationTextModerationException.class);
    }

    private static TextModerationPlusResponse response(String riskLevel, List<String> labels) {
        var results = labels.stream().map(label -> new TextModerationPlusResponseBody
                .TextModerationPlusResponseBodyDataResult().setLabel(label)).toList();
        var data = new TextModerationPlusResponseBody.TextModerationPlusResponseBodyData()
                .setRiskLevel(riskLevel)
                .setResult(results);
        var body = new TextModerationPlusResponseBody()
                .setCode(200)
                .setRequestId("request-1")
                .setData(data);
        return new TextModerationPlusResponse().setBody(body);
    }
}
