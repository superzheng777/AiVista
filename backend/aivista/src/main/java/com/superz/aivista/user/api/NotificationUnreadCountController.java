package com.superz.aivista.user.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.user.dto.NotificationUnreadCountResponse;
import com.superz.aivista.user.service.InteractionNotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Current user's combined notification badge count API. */
@Tag(name = "消息未读数")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/users/me/notifications/unread-count")
public class NotificationUnreadCountController {
    private final InteractionNotificationService notifications;

    public NotificationUnreadCountController(InteractionNotificationService notifications) {
        this.notifications = notifications;
    }

    @Operation(summary = "获取消息未读数")
    @GetMapping
    public ApiResponse<NotificationUnreadCountResponse> count(Authentication authentication) {
        var count = notifications.unreadCount(currentUserId(authentication));
        return ResponseUtils.success(new NotificationUnreadCountResponse(count.officialUnreadCount(),
                count.interactionUnreadCount(), count.totalUnreadCount()));
    }

    private static long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
