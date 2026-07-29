package com.superz.aivista.generation.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 注册当前阶段需要的图像生成配置绑定。
 * 百炼、OSS 与消息队列配置由对应阶段的客户端和服务使用。
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties({
        GenerationConsentProperties.class,
        GenerationTaskProperties.class,
        GenerationQueueProperties.class,
        GenerationBailianProperties.class,
        GenerationOssProperties.class
})
public class GenerationConfig {
}
