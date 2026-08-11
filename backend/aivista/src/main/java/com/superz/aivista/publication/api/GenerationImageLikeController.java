package com.superz.aivista.publication.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.publication.service.GenerationImageLikeService;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.security.core.Authentication;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/inspirations/{imageId}/like")
public class GenerationImageLikeController {
    private final GenerationImageLikeService service;

    public GenerationImageLikeController(GenerationImageLikeService service) {
        this.service = service;
    }

    @PutMapping
    public ResponseEntity<Void> like(Authentication authentication, @PathVariable long imageId,
            @RequestParam long publicationVersion) {
        service.like(currentUserId(authentication), imageId, publicationVersion);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> unlike(Authentication authentication, @PathVariable long imageId,
            @RequestParam long publicationVersion) {
        service.unlike(currentUserId(authentication), imageId, publicationVersion);
        return ResponseEntity.noContent().build();
    }

    private static long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
