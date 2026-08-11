package com.superz.aivista.user.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.publication.service.InspirationQueryService;
import com.superz.aivista.user.dto.PublicUserProfileResponse;
import com.superz.aivista.user.service.UserFollowService;
import com.superz.aivista.user.service.UserProfileService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/{userId}")
public class PublicUserController {
    private final UserProfileService profiles;
    private final UserFollowService follows;
    private final InspirationQueryService inspirations;

    public PublicUserController(UserProfileService profiles, UserFollowService follows,
            InspirationQueryService inspirations) {
        this.profiles = profiles;
        this.follows = follows;
        this.inspirations = inspirations;
    }

    @GetMapping
    public ApiResponse<PublicUserProfileResponse> profile(@PathVariable long userId, Authentication authentication) {
        return ResponseUtils.success(profiles.getPublicProfile(userId, currentOptionalUserId(authentication)));
    }

    @GetMapping("/publications")
    public ApiResponse<List<GenerationAssetImageResponse>> publications(
            @PathVariable long userId, Authentication authentication) {
        return ResponseUtils.success(inspirations.listPublicationsByUserId(userId, currentOptionalUserId(authentication)));
    }

    @PutMapping("/follow")
    public ResponseEntity<Void> follow(@PathVariable long userId, Authentication authentication) {
        follows.follow(currentUserId(authentication), userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/follow")
    public ResponseEntity<Void> unfollow(@PathVariable long userId, Authentication authentication) {
        follows.unfollow(currentUserId(authentication), userId);
        return ResponseEntity.noContent().build();
    }

    private static Long currentOptionalUserId(Authentication authentication) {
        return authentication != null && authentication.getPrincipal() instanceof Number userId ? userId.longValue() : null;
    }

    private static long currentUserId(Authentication authentication) {
        Long userId = currentOptionalUserId(authentication);
        if (userId == null) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        return userId;
    }
}
