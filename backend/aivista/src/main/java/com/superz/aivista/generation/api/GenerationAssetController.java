package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.DeleteGenerationImagesRequest;
import com.superz.aivista.generation.dto.GenerationAssetPageResponse;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.service.GenerationAssetDeletionService;
import com.superz.aivista.generation.service.GenerationAssetQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 提供当前用户私有生成资产的浏览接口。 */
@Tag(name = "个人生成资产")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/generation-images")
public class GenerationAssetController {
    private final GenerationAssetQueryService queryService;
    private final GenerationAssetDeletionService deletionService;

    public GenerationAssetController(GenerationAssetQueryService queryService, GenerationAssetDeletionService deletionService) {
        this.queryService = queryService;
        this.deletionService = deletionService;
    }

    @Operation(summary = "获取个人生成资产", description = "按成功保存时间倒序，使用不透明游标分页返回当前用户仍可见的私有图片。")
    @GetMapping
    public ResponseEntity<ApiResponse<GenerationAssetPageResponse>> list(
            Authentication authentication,
            @Parameter(description = "上一页最后一项返回的不透明游标") @RequestParam(required = false) String cursor,
            @Parameter(description = "每页数量，默认 36，范围 1 到 60") @RequestParam(required = false) Integer limit) {
        GenerationAssetPageResponse response = queryService.list(currentUserId(authentication), cursor, limit);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(response));
    }

    @Operation(summary = "获取单张个人生成资产", description = "仅返回当前用户未删除图片的完整资产项及新签发的短期 URL。")
    @GetMapping("/{imageId}")
    public ResponseEntity<ApiResponse<GenerationAssetImageResponse>> get(
            Authentication authentication,
            @PathVariable long imageId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(queryService.get(currentUserId(authentication), imageId)));
    }

    @Operation(summary = "删除个人生成资产", description = "批量标记当前用户手动勾选的图片，已删除、他人或不存在图片按幂等成功处理。")
    @PostMapping("/delete")
    public ApiResponse<Void> delete(Authentication authentication, @Valid @RequestBody DeleteGenerationImagesRequest request) {
        deletionService.delete(currentUserId(authentication), request.imageIds());
        return ResponseUtils.success(null);
    }

    private long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
