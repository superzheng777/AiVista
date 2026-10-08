package com.superz.aivista.generation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 注册资产管理、SSE 与业务待办清理使用的配置。
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties({
        GenerationConsentProperties.class,
        GenerationSseProperties.class,
        OutboxCleanupProperties.class,
        GenerationAssetCleanupProperties.class,
        GenerationAssetUploadProperties.class,
        GenerationOssProperties.class,
        GenerationWorkerApiProperties.class
})
public class GenerationConfig {

    /** 发布审核、通知和搜索客户端使用的 Jackson 2 序列化器。 */
    @Bean
    ObjectMapper generationObjectMapper() {
        return new ObjectMapper();
    }
}
