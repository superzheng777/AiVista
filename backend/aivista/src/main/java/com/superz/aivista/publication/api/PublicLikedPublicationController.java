package com.superz.aivista.publication.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.publication.dto.LikedPublicationResponse;
import com.superz.aivista.publication.service.InspirationQueryService;
import com.superz.aivista.user.mapper.UserMapper;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/{userId}/liked-publications")
public class PublicLikedPublicationController {
    private final InspirationQueryService service;
    private final UserMapper users;
    public PublicLikedPublicationController(InspirationQueryService service, UserMapper users) { this.service = service; this.users = users; }
    @GetMapping
    public ApiResponse<List<LikedPublicationResponse>> list(@PathVariable long userId, Authentication authentication) {
        if (!Boolean.TRUE.equals(users.selectLikesPublicById(userId))) throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        Long viewer = authentication != null && authentication.getPrincipal() instanceof Number id ? id.longValue() : null;
        return ResponseUtils.success(service.listLiked(userId, viewer));
    }
}
