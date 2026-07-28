package com.superz.aivista.generation.api;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import com.superz.aivista.generation.dto.CreateGenerationTaskRequest;
import com.superz.aivista.generation.dto.CreateGenerationTaskResponse;
import com.superz.aivista.generation.service.GenerationTaskCreationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 接收普通文生图任务；实际执行将在后续队列阶段接入。 */
@Tag(name = "图像生成任务")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/generation-tasks")
public class GenerationTaskController {
    private final GenerationTaskCreationService creationService;

    public GenerationTaskController(GenerationTaskCreationService creationService) {
        this.creationService = creationService;
    }

    @Operation(summary = "创建普通文生图任务", description = "原子创建会话、提示词消息、排队任务和执行 Outbox 事件；任务将在后续队列阶段消费。")
    @PostMapping
    public ResponseEntity<ApiResponse<CreateGenerationTaskResponse>> create(
            Authentication authentication,
            /** 同一次用户主动提交的网络重试必须复用该 UUID v4。 */
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true, content = @Content(
                    mediaType = "application/json", examples = @ExampleObject(value = """
                            {
                              "sessionId": "456",
                              "prompt": "一座漂浮在云海上的未来城市，日落，电影感",
                              "negativePrompt": "模糊，低清晰度",
                              "aspectRatio": "16:9",
                              "imageCount": 1
                            }
                            """)))
            @RequestBody CreateGenerationTaskRequest request) {
        CreateGenerationTaskResponse response = creationService.create(
                currentUserId(authentication), idempotencyKey, request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ResponseUtils.success(response));
    }

    private long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Number userId)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        return userId.longValue();
    }
}
