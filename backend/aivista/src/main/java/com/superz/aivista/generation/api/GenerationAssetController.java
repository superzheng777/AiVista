package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.DeleteGenerationImagesRequest;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.dto.SetGenerationImageFavoritesRequest;
import com.superz.aivista.generation.dto.UploadedImageAssetResponse;
import com.superz.aivista.generation.service.GenerationAssetDeletionService;
import com.superz.aivista.generation.service.GenerationAssetQueryService;
import com.superz.aivista.generation.service.GenerationImageFavoriteService;
import com.superz.aivista.generation.service.ImageAssetUploadService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

/** Current user's private generated-image assets. */
@Tag(name = "个人生成资产")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/generation-images")
public class GenerationAssetController {
    private final GenerationAssetQueryService queryService;
    private final GenerationAssetDeletionService deletionService;
    private final GenerationImageFavoriteService favoriteService;
    private final ImageAssetUploadService uploadService;

    public GenerationAssetController(GenerationAssetQueryService queryService,
            GenerationAssetDeletionService deletionService, GenerationImageFavoriteService favoriteService,
            ImageAssetUploadService uploadService) {
        this.queryService = queryService;
        this.deletionService = deletionService;
        this.favoriteService = favoriteService;
        this.uploadService = uploadService;
    }

    @Operation(summary = "上传图生图参考图片", description = "上传后返回临时图片资产 ID；该资产只可由当前用户在有效期内作为图生图输入。")
    @PostMapping(path = "/uploads", consumes = "multipart/form-data")
    public ApiResponse<UploadedImageAssetResponse> upload(Authentication authentication, @RequestParam("file") MultipartFile file) {
        return ResponseUtils.success(uploadService.upload(currentUserId(authentication), file));
    }

    @Operation(summary = "获取个人生成资产", description = "返回当前用户全部未删除资产，按生成时间倒序。"
            + " 每项使用资产、发布列表和灵感列表共用的图片展示 DTO。")
    @GetMapping
    public ResponseEntity<ApiResponse<List<GenerationAssetImageResponse>>> list(Authentication authentication) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(queryService.listAll(currentUserId(authentication))));
    }

    @Operation(summary = "获取单张个人生成资产", description = "返回当前用户未删除资产，并签发新的短期图片 URL。")
    @GetMapping("/{imageId}")
    public ResponseEntity<ApiResponse<GenerationAssetImageResponse>> get(
            Authentication authentication, @PathVariable long imageId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(queryService.get(currentUserId(authentication), imageId)));
    }

    @Operation(summary = "获取原图下载 URL", description = "仅当前图片作者可获取 original.png 的 3 分钟临时下载地址。")
    @GetMapping("/{imageId}/original-download")
    public ResponseEntity<ApiResponse<GenerationAssetImageResponse.ImageUrl>> originalDownload(
            Authentication authentication, @PathVariable long imageId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(queryService.originalDownload(currentUserId(authentication), imageId)));
    }

    @Operation(summary = "删除个人生成资产", description = "批量标记当前用户选中的图片为已删除；已删除、他人或不存在的图片按幂等成功处理。")
    @PostMapping("/delete")
    public ApiResponse<Void> delete(Authentication authentication,
            @Valid @RequestBody DeleteGenerationImagesRequest request) {
        deletionService.delete(currentUserId(authentication), request.imageIds());
        return ResponseUtils.success(null);
    }

    @Operation(summary = "批量设置生成图片收藏状态", description = "favorite=true 收藏，favorite=false 取消收藏；重复请求均按成功处理。")
    @PostMapping("/favorites")
    public ApiResponse<Void> setFavorites(Authentication authentication,
            @Valid @RequestBody SetGenerationImageFavoritesRequest request) {
        favoriteService.setFavorites(currentUserId(authentication), request.imageIds(), request.favorite());
        return ResponseUtils.success(null);
    }

    private long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
