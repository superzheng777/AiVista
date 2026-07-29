package com.superz.aivista.generation.config;

import com.aliyun.oss.ClientBuilderConfiguration;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** 创建图像生成执行阶段共用的百炼 HTTP 客户端和 OSS 客户端。 */
@Configuration
public class GenerationExecutionConfiguration {

    @Bean
    RestClient generationBailianRestClient(GenerationBailianProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.connectTimeout());
        requestFactory.setReadTimeout(properties.readTimeout());
        return RestClient.builder()
                .baseUrl(properties.endpoint())
                .requestFactory(requestFactory)
                .build();
    }

    @Bean(destroyMethod = "shutdown")
    OSS generationOssClient(GenerationOssProperties properties) {
        ClientBuilderConfiguration configuration = new ClientBuilderConfiguration();
        configuration.setConnectionTimeout(toMilliseconds(properties.connectTimeout()));
        configuration.setSocketTimeout(toMilliseconds(properties.readTimeout()));
        return new OSSClientBuilder().build(
                properties.endpoint(),
                properties.accessKeyId(),
                properties.accessKeySecret(),
                configuration);
    }

    private static int toMilliseconds(Duration duration) {
        return Math.toIntExact(duration.toMillis());
    }
}
