package com.superz.aivista.auth.config;

import java.security.SecureRandom;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 提供认证基础组件需要的可替换依赖。 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties({AuthProperties.class, AuthSessionCleanupProperties.class})
public class AuthTokenConfig {

    @Bean
    public Clock authClock() {
        return Clock.systemUTC();
    }

    @Bean
    public SecureRandom authSecureRandom() {
        return new SecureRandom();
    }

    @Bean
    public PasswordEncoder passwordEncoder(AuthProperties properties) {
        AuthProperties.Argon2 argon2 = properties.argon2();
        return new Argon2PasswordEncoder(
                argon2.saltLength(),
                argon2.hashLength(),
                argon2.parallelism(),
                argon2.memory(),
                argon2.iterations());
    }
}
