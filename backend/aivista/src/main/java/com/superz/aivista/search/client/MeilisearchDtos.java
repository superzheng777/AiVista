package com.superz.aivista.search.client;

import java.util.List;

final class MeilisearchDtos {
    private MeilisearchDtos() { }

    record SearchRequest(String q, int offset, int limit, String matchingStrategy, List<String> attributesToRetrieve) { }
    record SearchResponse(List<SearchHit> hits, Integer estimatedTotalHits) { }
    record SearchHit(Long imageId) { }
    record TaskSummary(Long taskUid) { }
    record Task(Long uid, String status, Error error) { }
    record Error(String code, String type) { }
    record IndexInfo(String uid) { }
    record IndexStats(Long numberOfDocuments) { }
}
