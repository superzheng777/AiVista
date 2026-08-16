package com.superz.aivista.search.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.search.config.MeilisearchProperties;
import com.superz.aivista.search.model.SearchIndexDocument;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class MeilisearchAdminClient {
    private static final Duration TASK_POLL_INTERVAL = Duration.ofMillis(200);
    private final RestClient client;
    private final MeilisearchProperties properties;
    private final ObjectMapper objectMapper;

    public MeilisearchAdminClient(@Qualifier("meilisearchAdminRestClient") RestClient client,
            MeilisearchProperties properties, ObjectMapper objectMapper) {
        this.client = client;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public boolean indexExists(String uid) {
        try {
            client.get().uri("/indexes/{uid}", uid).retrieve().body(MeilisearchDtos.IndexInfo.class);
            return true;
        } catch (RestClientResponseException exception) {
            MeilisearchAdminException classified = classify(exception);
            if (classified.kind() == MeilisearchAdminException.Kind.INDEX_NOT_FOUND) return false;
            throw classified;
        } catch (RestClientException exception) {
            throw transientFailure(exception);
        }
    }

    public long createIndex(String uid) {
        return taskUid(() -> client.post().uri("/indexes").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("uid", uid, "primaryKey", "imageId")).retrieve()
                .body(MeilisearchDtos.TaskSummary.class));
    }

    public long updateSettings(String uid) {
        Map<String, Object> settings = Map.ofEntries(
                Map.entry("searchableAttributes", List.of("title", "finalPrompt")),
                Map.entry("displayedAttributes", List.of("imageId")),
                Map.entry("sortableAttributes", List.of("likeCount", "publicAt", "imageId")),
                Map.entry("rankingRules", List.of("words", "typo", "proximity", "attributeRank", "wordPosition",
                        "exactness", "likeCount:desc", "publicAt:desc", "imageId:desc")),
                Map.entry("typoTolerance", Map.of("disableOnNumbers", true)),
                Map.entry("pagination", Map.of("maxTotalHits", 200)),
                Map.entry("localizedAttributes", List.of(Map.of(
                        "attributePatterns", List.of("title", "finalPrompt"), "locales", List.of("cmn")))),
                Map.entry("prefixSearch", "indexingTime"));
        return taskUid(() -> client.patch().uri("/indexes/{uid}/settings", uid)
                .contentType(MediaType.APPLICATION_JSON).body(settings).retrieve()
                .body(MeilisearchDtos.TaskSummary.class));
    }

    public long upsertDocuments(String uid, List<SearchIndexDocument> documents) {
        if (documents.isEmpty()) return -1;
        return taskUid(() -> client.put().uri("/indexes/{uid}/documents", uid)
                .contentType(MediaType.APPLICATION_JSON).body(documents).retrieve()
                .body(MeilisearchDtos.TaskSummary.class));
    }

    public long deleteDocument(String uid, long imageId) {
        return taskUid(() -> client.delete().uri("/indexes/{uid}/documents/{imageId}", uid, imageId)
                .retrieve().body(MeilisearchDtos.TaskSummary.class));
    }

    public long deleteIndex(String uid) {
        return taskUid(() -> client.delete().uri("/indexes/{uid}", uid).retrieve()
                .body(MeilisearchDtos.TaskSummary.class));
    }

    public long renameIndex(String currentUid, String newUid) {
        return taskUid(() -> client.patch().uri("/indexes/{uid}", currentUid)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("uid", newUid)).retrieve()
                .body(MeilisearchDtos.TaskSummary.class));
    }

    public long swapIndexes(String firstUid, String secondUid) {
        return taskUid(() -> client.post().uri("/swap-indexes").contentType(MediaType.APPLICATION_JSON)
                .body(List.of(Map.of("indexes", List.of(firstUid, secondUid)))).retrieve()
                .body(MeilisearchDtos.TaskSummary.class));
    }

    public long documentCount(String uid) {
        try {
            MeilisearchDtos.IndexStats stats = client.get().uri("/indexes/{uid}/stats", uid).retrieve()
                    .body(MeilisearchDtos.IndexStats.class);
            return stats == null || stats.numberOfDocuments() == null ? 0 : stats.numberOfDocuments();
        } catch (RestClientResponseException exception) {
            throw classify(exception);
        } catch (RestClientException exception) {
            throw transientFailure(exception);
        }
    }

    public void waitForTask(long taskUid) {
        if (taskUid < 0) return;
        long deadline = System.nanoTime() + properties.taskWaitTimeout().toNanos();
        while (System.nanoTime() < deadline) {
            MeilisearchDtos.Task task = getTask(taskUid);
            if (task != null && "succeeded".equals(task.status())) return;
            if (task != null && ("failed".equals(task.status()) || "canceled".equals(task.status()))) {
                throw classifyTask(task);
            }
            try {
                Thread.sleep(TASK_POLL_INTERVAL);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw transientFailure(exception);
            }
        }
        throw transientFailure(new IllegalStateException("Meilisearch task wait timeout"));
    }

    private MeilisearchDtos.Task getTask(long taskUid) {
        try {
            return client.get().uri("/tasks/{taskUid}", taskUid).retrieve().body(MeilisearchDtos.Task.class);
        } catch (RestClientResponseException exception) {
            throw classify(exception);
        } catch (RestClientException exception) {
            throw transientFailure(exception);
        }
    }

    private long taskUid(Request request) {
        try {
            MeilisearchDtos.TaskSummary task = request.execute();
            if (task == null || task.taskUid() == null) {
                throw new MeilisearchAdminException(MeilisearchAdminException.Kind.TRANSIENT, "missing_task_uid", null);
            }
            return task.taskUid();
        } catch (RestClientResponseException exception) {
            throw classify(exception);
        } catch (ResourceAccessException exception) {
            throw transientFailure(exception);
        } catch (RestClientException exception) {
            throw transientFailure(exception);
        }
    }

    private MeilisearchAdminException classify(RestClientResponseException exception) {
        MeilisearchDtos.Error error = parseError(exception.getResponseBodyAsString());
        String code = error == null ? null : error.code();
        String type = error == null ? null : error.type();
        if ("index_not_found".equals(code)) {
            return new MeilisearchAdminException(MeilisearchAdminException.Kind.INDEX_NOT_FOUND, code, exception);
        }
        if (exception.getStatusCode().value() == 401 || exception.getStatusCode().value() == 403
                || "auth".equals(type) || "invalid_request".equals(type)) {
            return new MeilisearchAdminException(MeilisearchAdminException.Kind.REQUIRES_ACTION, code, exception);
        }
        return new MeilisearchAdminException(MeilisearchAdminException.Kind.TRANSIENT, code, exception);
    }

    private MeilisearchAdminException classifyTask(MeilisearchDtos.Task task) {
        MeilisearchDtos.Error error = task.error();
        String code = error == null ? null : error.code();
        String type = error == null ? null : error.type();
        if ("index_not_found".equals(code)) {
            return new MeilisearchAdminException(MeilisearchAdminException.Kind.INDEX_NOT_FOUND, code, null);
        }
        MeilisearchAdminException.Kind kind = "auth".equals(type) || "invalid_request".equals(type)
                ? MeilisearchAdminException.Kind.REQUIRES_ACTION : MeilisearchAdminException.Kind.TRANSIENT;
        return new MeilisearchAdminException(kind, code, null);
    }

    private MeilisearchDtos.Error parseError(String body) {
        try {
            return objectMapper.readValue(body, MeilisearchDtos.Error.class);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static MeilisearchAdminException transientFailure(Throwable cause) {
        return new MeilisearchAdminException(MeilisearchAdminException.Kind.TRANSIENT, null, cause);
    }

    @FunctionalInterface
    private interface Request {
        MeilisearchDtos.TaskSummary execute();
    }
}
