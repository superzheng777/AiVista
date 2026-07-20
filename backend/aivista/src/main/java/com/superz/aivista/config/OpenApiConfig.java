package com.superz.aivista.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** OpenAPI 文档基础信息配置。 */
@Configuration
public class OpenApiConfig {

    /**
     * 定义 Knife4j / Swagger UI 顶部展示的文档元数据。
     */
    @Bean
    public OpenAPI aivistaOpenApi() {
        return new OpenAPI()
                .components(new Components().addSecuritySchemes(
                        "bearerAuth",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .info(new Info()
                        .title("AiVista API 文档")
                        .description("AiVista AI 文生图项目的后端接口文档。")
                        .version("v1")
                        .contact(new Contact().name("AiVista")));
    }
}
