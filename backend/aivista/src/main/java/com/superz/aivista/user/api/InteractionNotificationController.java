package com.superz.aivista.user.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.user.dto.InteractionNotificationPageResponse;
import com.superz.aivista.user.dto.DeleteInteractionNotificationsRequest;
import com.superz.aivista.user.service.InteractionNotificationService;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Current user's interaction notification read API. */
@Tag(name = "互动消息")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/users/me/interaction-notifications")
public class InteractionNotificationController {
    private final InteractionNotificationService notifications;

    public InteractionNotificationController(InteractionNotificationService notifications) {
        this.notifications = notifications;
    }

    @Operation(summary = "获取互动消息")
    @GetMapping
    public ResponseEntity<ApiResponse<InteractionNotificationPageResponse>> list(Authentication authentication,
            @RequestParam(required = false) String cursor) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(notifications.list(currentUserId(authentication), cursor)));
    }

    @Operation(summary = "标记互动消息已读")
    @PostMapping("/{notificationId}/read")
    public ResponseEntity<Void> markRead(Authentication authentication, @PathVariable long notificationId) {
        notifications.markRead(currentUserId(authentication), notificationId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "全部标记互动消息已读")
    @PostMapping("/read-all")
    public ResponseEntity<Void> markAllRead(Authentication authentication) {
        notifications.markAllRead(currentUserId(authentication));
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "删除单条互动消息")
    @DeleteMapping("/{notificationId}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable long notificationId) {
        notifications.delete(currentUserId(authentication), notificationId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "批量删除互动消息")
    @PostMapping("/deletions")
    public ResponseEntity<Void> deleteBatch(Authentication authentication,
            @Valid @RequestBody DeleteInteractionNotificationsRequest request) {
        notifications.deleteBatch(currentUserId(authentication), request.notificationIds());
        return ResponseEntity.noContent().build();
    }

    private static long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
