package com.superz.aivista.controller;

import cn.hutool.core.date.DateUtil;
import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


/** 提供服务存活状态，供本地联调、负载均衡或监控系统调用。 */
@Tag(name = "健康检查", description = "服务运行状态接口")
@RestController
@RequestMapping("/health")
public class HealthController {

    /**
     * 返回服务当前运行状态。
     *
     * @return 服务状态与服务器时间
     */
    @Operation(summary = "健康检查", description = "确认 AiVista 后端服务可以正常响应请求。")
    @GetMapping
    public ApiResponse<HealthResponse> health() {
        return ResponseUtils.success(new HealthResponse(
                "success", "aivista", DateUtil.now()));
    }

    private record HealthResponse(String status, String application, String timestamp) {
    }
}
