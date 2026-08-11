package com.superz.aivista.publication.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.publication.dto.UpdateLikedPublicationsVisibilityRequest;
import com.superz.aivista.user.mapper.UserMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/me/liked-publications-visibility")
public class LikedPublicationVisibilityController {
    private final UserMapper users;
    public LikedPublicationVisibilityController(UserMapper users) { this.users = users; }
    @PutMapping
    public ResponseEntity<Void> update(Authentication authentication, @RequestBody UpdateLikedPublicationsVisibilityRequest request) {
        if (users.updateLikesPublic(currentUserId(authentication), request.publicVisible()) != 1) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        return ResponseEntity.noContent().build();
    }
    private static long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        return userId.longValue();
    }
}
