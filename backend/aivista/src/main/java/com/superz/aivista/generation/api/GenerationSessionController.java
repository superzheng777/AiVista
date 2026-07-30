package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.GenerationMessagePageResponse;
import com.superz.aivista.generation.dto.GenerationSessionPageResponse;
import com.superz.aivista.generation.service.GenerationSessionMessageQueryService;
import com.superz.aivista.generation.service.GenerationSessionQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    private final GenerationSessionMessageQueryService messageQueryService;

    public GenerationSessionController(GenerationSessionQueryService queryService,
            GenerationSessionMessageQueryService messageQueryService) {
        this.queryService = queryService;
        this.messageQueryService = messageQueryService;
    }

    @Operation(summary = "获取生成会话列表", description = "按最近提示词时间倒序，使用不透明游标分页返回当前用户已有内容的会话。")
    @GetMapping
    public ApiResponse<GenerationSessionPageResponse> list(
            Authentication authentication,
            @Parameter(description = "上一页最后一项返回的不透明游标") @RequestParam(required = false) String cursor,
            @Parameter(description = "每页数量，默认 20，范围 1 到 50") @RequestParam(required = false) Integer limit) {
        return ResponseUtils.success(queryService.list(currentUserId(authentication), cursor, limit));
    }

    @Operation(summary = "获取生成会话消息历史", description = "按消息序号向前翻页，响应中的消息按时间正序排列。")
    @GetMapping("/{sessionId}/messages")
    public ApiResponse<GenerationMessagePageResponse> listMessages(
            Authentication authentication,
            @Parameter(description = "会话 ID") @PathVariable long sessionId,
            @Parameter(description = "当前页最早消息返回的不透明游标") @RequestParam(required = false) String before,
            @Parameter(description = "每页数量，默认 30，范围 1 到 100") @RequestParam(required = false) Integer limit) {
        return ResponseUtils.success(messageQueryService.list(currentUserId(authentication), sessionId, before, limit));
    }

    private long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
