package com.superz.aivista.search.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

final class MeilisearchDtos {
    private MeilisearchDtos() { }

    record SearchRequest(String q, int offset, int limit, String matchingStrategy, List<String> attributesToRetrieve) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record SearchResponse(List<SearchHit> hits, Integer estimatedTotalHits) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record SearchHit(Long imageId) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TaskSummary(Long taskUid) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Task(Long uid, String status, Error error) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Error(String code, String type) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record IndexInfo(String uid) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record IndexStats(Long numberOfDocuments) { }
}
