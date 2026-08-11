package com.superz.aivista.publication.api;

import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.publication.service.InspirationQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    @Operation(summary = "获取灵感列表", description = "返回已发布图片。每项使用与资产、我的发布相同的图片展示 DTO。")
    @GetMapping
    public ApiResponse<List<GenerationAssetImageResponse>> list(Authentication authentication) {
        Long viewerUserId = authentication != null && authentication.getPrincipal() instanceof Number id ? id.longValue() : null;
        return ResponseUtils.success(service.list(viewerUserId));
    }

    @Operation(summary = "获取公开作品详情", description = "仅返回仍处于已发布状态的单张作品，并签发新的短期图片 URL。")
    @GetMapping("/{imageId}")
    public ApiResponse<GenerationAssetImageResponse> get(@PathVariable long imageId, Authentication authentication) {
        Long viewerUserId = authentication != null && authentication.getPrincipal() instanceof Number id ? id.longValue() : null;
        return ResponseUtils.success(service.get(imageId, viewerUserId));
    }
}
