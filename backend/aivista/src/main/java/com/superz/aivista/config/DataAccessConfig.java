package com.superz.aivista.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/** 配置各业务模块 Mapper 的扫描范围。 */
@Configuration
@MapperScan({
        "com.superz.aivista.user.mapper",
        "com.superz.aivista.auth.mapper",
        "com.superz.aivista.common.idempotency",
        "com.superz.aivista.generation.mapper"
})
public class DataAccessConfig {
}
