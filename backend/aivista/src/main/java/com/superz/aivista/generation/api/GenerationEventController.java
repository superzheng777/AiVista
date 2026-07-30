package com.superz.aivista.generation.api;

import com.superz.aivista.auth.token.AccessTokenClaims;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.service.GenerationSseConnectionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** 提供当前用户生成任务的单向实时状态流。 */
@Tag(name = "生成任务事件")
@SecurityRequirement(name = "bearerAuth")
@RestController
public class GenerationEventController {
    private final GenerationSseConnectionService connectionService;

    public GenerationEventController(GenerationSseConnectionService connectionService) {
        this.connectionService = connectionService;
    }

    @Operation(summary = "建立生成任务事件流", description = "使用 Bearer Access Token 建立 SSE 连接；仅发送最小任务状态通知。")
    @GetMapping(path = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)
                || !(authentication.getDetails() instanceof AccessTokenClaims claims)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return connectionService.connect(userId.longValue(), claims.expiresAt());
    }
}
