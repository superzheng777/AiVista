package com.superz.aivista.search.client;

import com.superz.aivista.search.config.MeilisearchProperties;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class MeilisearchSearchClient {
    private final RestClient client;
    private final MeilisearchProperties properties;

    public MeilisearchSearchClient(@Qualifier("meilisearchSearchRestClient") RestClient client,
            MeilisearchProperties properties) {
        this.client = client;
        this.properties = properties;
    }

    public List<Long> search(String query, int offset, int limit) {
        if (!properties.enabled()) throw new MeilisearchSearchException(new IllegalStateException("Search disabled"));
        try {
            MeilisearchDtos.SearchResponse response = client.post()
                    .uri("/indexes/{indexUid}/search", properties.indexUid())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new MeilisearchDtos.SearchRequest(query, offset, limit, "frequency", List.of("imageId")))
                    .retrieve()
                    .body(MeilisearchDtos.SearchResponse.class);
            return response == null || response.hits() == null ? List.of()
                    : response.hits().stream().map(MeilisearchDtos.SearchHit::imageId).filter(java.util.Objects::nonNull).toList();
        } catch (RestClientException exception) {
            throw new MeilisearchSearchException(exception);
        }
    }

    public boolean healthy() {
        if (!properties.enabled()) return false;
        try {
            client.get().uri("/health").retrieve().toBodilessEntity();
            return true;
        } catch (RestClientException exception) {
            return false;
        }
    }
}
