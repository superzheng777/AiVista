package com.superz.aivista.publication.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.publication.dto.RequestPublicationRequest;
import com.superz.aivista.publication.dto.PublicationRequestResponse;
import com.superz.aivista.publication.service.PublicationService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/generation-images/{imageId}/publication")
public class PublicationController {
    private final PublicationService publicationService;

    public PublicationController(PublicationService publicationService) {
        this.publicationService = publicationService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<PublicationRequestResponse>> request(Authentication authentication, @PathVariable long imageId,
            @Valid @RequestBody RequestPublicationRequest request) {
        PublicationRequestResponse response = publicationService.request(
                currentUserId(authentication), imageId, request.title(), request.description());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ResponseUtils.success(response));
    }

    @DeleteMapping
    public ApiResponse<Void> withdraw(Authentication authentication, @PathVariable long imageId) {
        publicationService.withdraw(currentUserId(authentication), imageId);
        return ResponseUtils.success(null);
    }

    private static long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
