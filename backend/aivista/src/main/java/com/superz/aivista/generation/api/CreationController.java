package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.generation.dto.CreationRequest;
import com.superz.aivista.generation.service.CreationImageService;
import com.superz.aivista.generation.service.CreationRuntimeClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@Tag(name = "创作会话")
@SecurityRequirement(name = "bearerAuth")
public class CreationController {
    private final CreationRuntimeClient runtime;
    private final CreationImageService images;
    private final JdbcTemplate jdbc;
    public CreationController(CreationRuntimeClient runtime, CreationImageService images, JdbcTemplate jdbc) {
        this.runtime = runtime; this.images = images; this.jdbc = jdbc;
    }

    @GetMapping("/generation-sessions")
    @Operation(summary = "获取当前用户全部会话摘要")
    public ApiResponse<JsonNode> sessions(Authentication auth) {
        return ApiResponse.success(runtime.request(userId(auth), "GET", "/generation-sessions", null));
    }

    @GetMapping("/generation-sessions/{sessionId}")
    @Operation(summary = "获取完整会话，最多30轮")
    public ApiResponse<JsonNode> session(Authentication auth, @PathVariable long sessionId) {
        long userId = userId(auth); ownSession(userId, sessionId);
        return display(runtime.request(userId, "GET", "/generation-sessions/" + sessionId, null));
    }

    @PatchMapping("/generation-sessions/{sessionId}")
    public ApiResponse<JsonNode> title(Authentication auth, @PathVariable long sessionId, @RequestBody JsonNode body) {
        long userId = userId(auth); ownSession(userId, sessionId);
        return ApiResponse.success(runtime.request(userId, "PATCH", "/generation-sessions/" + sessionId, body));
    }

    @DeleteMapping("/generation-sessions/{sessionId}")
    @Operation(summary = "逻辑删除会话；有活动任务时返回409，重复删除返回204")
    public ResponseEntity<Void> deleteSession(Authentication auth, @PathVariable long sessionId) {
        runtime.request(userId(auth), "DELETE", "/generation-sessions/" + sessionId, null);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/creations")
    @Operation(summary = "提交普通或Agent创作；不提供sessionId时创建会话")
    public ResponseEntity<ApiResponse<JsonNode>> create(Authentication auth, @Valid @RequestBody CreationRequest request) {
        long userId = userId(auth);
        if (request.sessionId() != null) ownSession(userId, Long.parseLong(request.sessionId()));
        var assets = images.authorize(userId, request.input().assetIds());
        var input = Map.of("prompt", request.input().prompt(), "assetIds",
                request.input().assetIds() == null ? List.of() : request.input().assetIds());
        var normalized = new java.util.LinkedHashMap<String, Object>();
        if (request.sessionId() != null) normalized.put("sessionId", request.sessionId());
        normalized.put("mode", request.mode()); normalized.put("input", input);
        var settings = new java.util.LinkedHashMap<String, Object>();
        if (request.settings() != null) {
            var supplied = request.settings();
            if (supplied.aspectRatio() != null) settings.put("aspectRatio", supplied.aspectRatio());
            if (supplied.imageCount() != null) settings.put("imageCount", supplied.imageCount());
            if (supplied.negativePrompt() != null) settings.put("negativePrompt", supplied.negativePrompt());
            if (supplied.promptExtend() != null) settings.put("promptExtend", supplied.promptExtend());
        }
        normalized.put("settings", settings);
        var result = runtime.request(userId, "POST", "/creations", Map.of("request", normalized, "assets", assets));
        return ResponseEntity.accepted().location(URI.create("/api/creations/" + result.path("turn").path("creationId").asText()))
                .body(display(result));
    }

    @GetMapping("/creations/{creationId}")
    public ApiResponse<JsonNode> creation(Authentication auth, @PathVariable long creationId) {
        long userId = userId(auth); ownCreation(userId, creationId);
        return display(runtime.request(userId, "GET", "/creations/" + creationId, null));
    }

    @PutMapping("/creations/{creationId}/forms/{toolCallId}/response")
    public ResponseEntity<ApiResponse<JsonNode>> answer(Authentication auth, @PathVariable long creationId,
            @PathVariable String toolCallId, @RequestBody JsonNode body) {
        long userId = userId(auth); ownCreation(userId, creationId);
        var result = runtime.request(userId, "PUT", "/creations/" + creationId + "/forms/"
                + URLEncoder.encode(toolCallId, StandardCharsets.UTF_8) + "/response", body);
        return ResponseEntity.status(result.path("changed").asBoolean() ? 201 : 200).body(display(result));
    }

    @PutMapping("/creations/{creationId}/cancellation")
    public ApiResponse<JsonNode> cancel(Authentication auth, @PathVariable long creationId) {
        long userId = userId(auth); ownCreation(userId, creationId);
        return ApiResponse.success(runtime.request(userId, "PUT", "/creations/" + creationId + "/cancellation", Map.of()));
    }

    private ApiResponse<JsonNode> display(JsonNode value) { return ApiResponse.success(images.signDisplay(value)); }
    private void ownSession(long userId, long id) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM generation_sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL", Integer.class, id, userId) != 1)
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
    }
    private void ownCreation(long userId, long id) {
        if (jdbc.queryForObject("""
                SELECT COUNT(*) FROM executions e JOIN generation_sessions s ON s.id = e.session_id
                WHERE e.id = ? AND e.user_id = ? AND e.kind = 'CREATION' AND s.deleted_at IS NULL
                """, Integer.class, id, userId) != 1)
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
    }
    private long userId(Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof Number id)) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        return id.longValue();
    }
}
