package com.superz.aivista.generation.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 注册当前阶段需要的图像生成配置绑定。
 * 百炼、OSS 与消息队列配置在对应执行阶段接入，避免在数据层预置无效配置。
 */
@Configuration
@EnableConfigurationProperties(GenerationConsentProperties.class)
public class GenerationConfig {
}
