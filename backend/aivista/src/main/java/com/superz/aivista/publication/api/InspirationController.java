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
import org.springframework.web.bind.annotation.RestController;

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
    public ApiResponse<List<GenerationAssetImageResponse>> list() {
        return ResponseUtils.success(service.list());
    }
}
