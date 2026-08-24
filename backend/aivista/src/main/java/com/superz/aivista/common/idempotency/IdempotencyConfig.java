package com.superz.aivista.common.idempotency;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** 注册通用幂等能力的配置绑定。 */
@Configuration
@EnableConfigurationProperties(IdempotencyCleanupProperties.class)
public class IdempotencyConfig {
}
