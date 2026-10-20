package com.superz.aivista.generation.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 单实例 WebSocket 连接与状态事件分发配置。 */
@ConfigurationProperties("app.events")
public record UserEventProperties(
        int maxConnectionsPerUser,
        int maxConnections,
        Duration heartbeatInterval,
        Duration dispatcherFixedDelay,
        int dispatcherBatchSize,
        Duration processingLease) {
}
