package com.superz.aivista.publication.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.publication.service.InspirationQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lists the current user's publicly visible works. */
@Tag(name = "我的发布")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/users/me/publications")
public class MyPublicationController {
    private final InspirationQueryService queryService;

    public MyPublicationController(InspirationQueryService queryService) {
        this.queryService = queryService;
    }

    @Operation(summary = "获取我的发布", description = "返回当前用户全部审核中和已发布图片，"
            + "按提交审核时间倒序。每项使用与资产、灵感列表相同的图片展示 DTO。")
    @GetMapping
    public ResponseEntity<ApiResponse<List<GenerationAssetImageResponse>>> list(Authentication authentication) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(queryService.listByUserId(currentUserId(authentication))));
    }

    private static long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
