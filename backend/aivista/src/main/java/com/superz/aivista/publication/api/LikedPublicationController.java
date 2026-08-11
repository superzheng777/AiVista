package com.superz.aivista.publication.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.publication.dto.LikedPublicationResponse;
import com.superz.aivista.publication.service.InspirationQueryService;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/me/liked-publications")
public class LikedPublicationController {
    private final InspirationQueryService service;
    public LikedPublicationController(InspirationQueryService service) { this.service = service; }
    @GetMapping
    public ApiResponse<List<LikedPublicationResponse>> list(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        return ResponseUtils.success(service.listLiked(userId.longValue(), userId.longValue()));
    }
}
