package com.superz.aivista.publication.config;

import com.aliyun.green20220302.Client;
import com.aliyun.teaopenapi.models.Config;
import com.superz.aivista.generation.config.GenerationOssProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(PublicationModerationProperties.class)
public class PublicationModerationConfiguration {

    @Bean
    Client publicationModerationClient(PublicationModerationProperties properties,
            GenerationOssProperties ossProperties) throws Exception {
        Config config = new Config()
                .setAccessKeyId(ossProperties.accessKeyId())
                .setAccessKeySecret(ossProperties.accessKeySecret())
                .setEndpoint(properties.endpoint())
                .setConnectTimeout(Math.toIntExact(properties.connectTimeout().toMillis()))
                .setReadTimeout(Math.toIntExact(properties.readTimeout().toMillis()));
        return new Client(config);
    }
}
