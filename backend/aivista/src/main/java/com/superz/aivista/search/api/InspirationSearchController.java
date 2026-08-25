package com.superz.aivista.search.api;

import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.search.config.MeilisearchProperties;
import com.superz.aivista.search.dto.InspirationSearchPageResponse;
import com.superz.aivista.search.service.InspirationSearchService;
import com.superz.aivista.search.service.SearchRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "灵感")
@RestController
@RequestMapping("/inspirations/search")
public class InspirationSearchController {
    private final InspirationSearchService service;
    private final SearchRateLimiter rateLimiter;
    private final MeilisearchProperties properties;

    public InspirationSearchController(InspirationSearchService service, SearchRateLimiter rateLimiter,
            MeilisearchProperties properties) {
        this.service = service;
        this.rateLimiter = rateLimiter;
        this.properties = properties;
    }

    @Operation(summary = "搜索公开作品", description = "每批最多 30 张；每个关键词最多检查前 200 个结果。")
    @GetMapping
    public ResponseEntity<ApiResponse<InspirationSearchPageResponse>> search(
            @RequestParam String q,
            @RequestParam(required = false) Integer offset,
            Authentication authentication,
            HttpServletRequest request) {
        Long viewerUserId = authentication != null && authentication.getPrincipal() instanceof Number id
                ? id.longValue() : null;
        rateLimiter.check(viewerUserId == null ? "ip:" + clientIp(request) : "user:" + viewerUserId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(service.search(q, offset, viewerUserId)));
    }

    private String clientIp(HttpServletRequest request) {
        if (properties.trustForwardedFor()) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",", 2)[0].trim();
        }
        return request.getRemoteAddr();
    }
}
