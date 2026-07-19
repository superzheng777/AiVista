package com.superz.aivista.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/** 配置用户与认证会话 Mapper 的扫描范围。 */
@Configuration
@MapperScan({"com.superz.aivista.user.mapper", "com.superz.aivista.auth.mapper"})
public class DataAccessConfig {
}
