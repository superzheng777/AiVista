package com.superz.aivista.search.config;

import java.net.http.HttpClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(MeilisearchProperties.class)
public class MeilisearchConfiguration {

    @Bean
    @Qualifier("meilisearchSearchRestClient")
    RestClient meilisearchSearchRestClient(MeilisearchProperties properties) {
        return client(properties.endpoint(), properties.searchKey(), properties.searchConnectTimeout(),
                properties.searchRequestTimeout());
    }

    @Bean
    @Qualifier("meilisearchAdminRestClient")
    RestClient meilisearchAdminRestClient(MeilisearchProperties properties) {
        return client(properties.endpoint(), properties.adminKey(), properties.indexConnectTimeout(),
                properties.indexRequestTimeout());
    }

    @Bean
    @Qualifier("meilisearchTaskRestClient")
    RestClient meilisearchTaskRestClient(MeilisearchProperties properties) {
        return client(properties.endpoint(), properties.taskKey(), properties.indexConnectTimeout(),
                properties.indexRequestTimeout());
    }

    private static RestClient client(String endpoint, String key, java.time.Duration connectTimeout,
            java.time.Duration readTimeout) {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(connectTimeout).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(readTimeout);
        RestClient.Builder builder = RestClient.builder().baseUrl(endpoint).requestFactory(requestFactory);
        if (key != null && !key.isBlank()) builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + key);
        return builder.build();
    }
}
