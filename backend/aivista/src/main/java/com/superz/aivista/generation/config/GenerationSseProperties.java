package com.superz.aivista.generation.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 单实例 SSE 连接与状态事件分发配置。 */
@ConfigurationProperties("app.generation.sse")
public record GenerationSseProperties(
        int maxConnectionsPerUser,
        int maxConnections,
        Duration heartbeatInterval,
        Duration dispatcherFixedDelay,
        int dispatcherBatchSize) {
}
