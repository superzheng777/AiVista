package com.superz.aivista.user.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.user.dto.OfficialNotificationResponse;
import com.superz.aivista.user.dto.UnreadOfficialNotificationCountResponse;
import com.superz.aivista.user.service.OfficialNotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Current user's official notification APIs. */
@Tag(name = "官方消息")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/users/me/official-notifications")
public class OfficialNotificationController {
    private final OfficialNotificationService notificationService;

    public OfficialNotificationController(OfficialNotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @Operation(summary = "获取全部官方消息")
    @GetMapping
    public ResponseEntity<ApiResponse<List<OfficialNotificationResponse>>> list(Authentication authentication) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(ResponseUtils.success(notificationService.list(currentUserId(authentication))));
    }

    @Operation(summary = "获取未读官方消息数量")
    @GetMapping("/unread-count")
    public ApiResponse<UnreadOfficialNotificationCountResponse> unreadCount(Authentication authentication) {
        return ResponseUtils.success(notificationService.unreadCount(currentUserId(authentication)));
    }

    @Operation(summary = "标记官方消息已读")
    @PostMapping("/{notificationId}/read")
    public ApiResponse<Void> markRead(Authentication authentication, @PathVariable long notificationId) {
        notificationService.markRead(currentUserId(authentication), notificationId);
        return ResponseUtils.success(null);
    }

    @Operation(summary = "全部标记官方消息已读")
    @PostMapping("/read-all")
    public ApiResponse<Void> markAllRead(Authentication authentication) {
        notificationService.markAllRead(currentUserId(authentication));
        return ResponseUtils.success(null);
    }

    @Operation(summary = "删除单条官方消息")
    @DeleteMapping("/{notificationId}")
    public ApiResponse<Void> delete(Authentication authentication, @PathVariable long notificationId) {
        notificationService.delete(currentUserId(authentication), notificationId);
        return ResponseUtils.success(null);
    }

    @Operation(summary = "清空全部官方消息")
    @DeleteMapping
    public ApiResponse<Void> deleteAll(Authentication authentication) {
        notificationService.deleteAll(currentUserId(authentication));
        return ResponseUtils.success(null);
    }

    private static long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
