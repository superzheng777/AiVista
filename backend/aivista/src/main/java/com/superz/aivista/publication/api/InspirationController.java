package com.superz.aivista.publication.api;

import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.publication.dto.InspirationPageResponse;
import com.superz.aivista.publication.service.InspirationQueryService;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.Authentication;

@Tag(name = "灵感")
@RestController
@RequestMapping("/inspirations")
public class InspirationController {
    private final InspirationQueryService service;

    public InspirationController(InspirationQueryService service) {
        this.service = service;
    }

    @Operation(summary = "获取灵感列表", description = "按公开时间倒序，每次最多返回 30 张。")
    @GetMapping
    public ApiResponse<InspirationPageResponse> list(
            Authentication authentication,
            @Parameter(description = "上一页最后一项返回的不透明游标") @RequestParam(required = false) String cursor) {
        Long viewerUserId = authentication != null && authentication.getPrincipal() instanceof Number id ? id.longValue() : null;
        return ResponseUtils.success(service.list(viewerUserId, cursor));
    }

    @Operation(summary = "获取关注列表", description = "按公开时间倒序返回当前用户所关注作者的公开作品；每次最多返回 30 张。")
    @GetMapping("/following")
    public ApiResponse<InspirationPageResponse> listFollowing(
            Authentication authentication,
            @Parameter(description = "上一页最后一项返回的不透明游标") @RequestParam(required = false) String cursor) {
        long viewerUserId = ((Number) authentication.getPrincipal()).longValue();
        return ResponseUtils.success(service.listFollowing(viewerUserId, cursor));
    }

    @Operation(summary = "获取公开作品详情", description = "仅返回仍处于已发布状态的单张作品，并签发新的短期图片 URL。")
    @GetMapping("/{imageId}")
    public ApiResponse<GenerationAssetImageResponse> get(@PathVariable long imageId, Authentication authentication) {
        Long viewerUserId = authentication != null && authentication.getPrincipal() instanceof Number id ? id.longValue() : null;
        return ResponseUtils.success(service.get(imageId, viewerUserId));
    }
}
