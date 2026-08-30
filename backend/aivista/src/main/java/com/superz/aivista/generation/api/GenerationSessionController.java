package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.ConversationTurnPageResponse;
import com.superz.aivista.generation.dto.GenerationSessionResponse;
import com.superz.aivista.generation.dto.GenerationSessionPageResponse;
import com.superz.aivista.generation.dto.UpdateGenerationSessionTitleRequest;
import com.superz.aivista.generation.service.GenerationSessionTurnQueryService;
import com.superz.aivista.generation.service.GenerationSessionQueryService;
import com.superz.aivista.generation.service.GenerationSessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 提供当前用户生成会话的侧栏分页读取接口。 */
@Tag(name = "生成会话")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/generation-sessions")
public class GenerationSessionController {
    private final GenerationSessionQueryService queryService;
    private final GenerationSessionTurnQueryService turnQueryService;
    private final GenerationSessionService sessionService;

    public GenerationSessionController(GenerationSessionQueryService queryService,
            GenerationSessionTurnQueryService turnQueryService, GenerationSessionService sessionService) {
        this.queryService = queryService;
        this.turnQueryService = turnQueryService;
        this.sessionService = sessionService;
    }

    @Operation(summary = "获取生成会话列表", description = "按最近用户消息时间倒序，使用不透明游标分页返回当前用户已有内容的会话。")
    @GetMapping
    public ApiResponse<GenerationSessionPageResponse> list(
            Authentication authentication,
            @Parameter(description = "上一页最后一项返回的不透明游标") @RequestParam(required = false) String cursor,
            @Parameter(description = "每页数量，默认 20，范围 1 到 50") @RequestParam(required = false) Integer limit) {
        return ResponseUtils.success(queryService.list(currentUserId(authentication), cursor, limit));
    }

    @Operation(summary = "获取生成会话创作历史", description = "按创作轮次向前翻页，响应中的轮次按时间正序排列。")
    @GetMapping("/{sessionId}/turns")
    public ApiResponse<ConversationTurnPageResponse> listTurns(
            Authentication authentication,
            @Parameter(description = "会话 ID") @PathVariable long sessionId,
            @Parameter(description = "当前页最早创作轮次返回的不透明游标") @RequestParam(required = false) String before,
            @Parameter(description = "每页数量，默认及最大值均为 5") @RequestParam(required = false) Integer limit) {
        return ResponseUtils.success(turnQueryService.list(currentUserId(authentication), sessionId, before, limit));
    }

    @Operation(summary = "修改生成会话标题", description = "仅允许当前用户修改自己的会话标题，不改变会话侧栏排序。")
    @PatchMapping("/{sessionId}")
    public ApiResponse<GenerationSessionResponse> updateTitle(
            Authentication authentication, @PathVariable long sessionId,
            @Valid @RequestBody UpdateGenerationSessionTitleRequest request) {
        return ResponseUtils.success(sessionService.updateTitle(currentUserId(authentication), sessionId, request.title()));
    }

    private long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
