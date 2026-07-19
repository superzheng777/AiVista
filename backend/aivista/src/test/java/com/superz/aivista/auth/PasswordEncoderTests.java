package com.superz.aivista.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.superz.aivista.auth.config.AuthTokenConfig;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

class PasswordEncoderTests {

    @Test
    void argon2EncodesAndVerifiesWithoutStoringPlaintext() {
        PasswordEncoder encoder = new AuthTokenConfig().passwordEncoder(TestAuthProperties.create());

        String encoded = encoder.encode("correct horse battery staple 123");

        assertThat(encoded).startsWith("$argon2id$");
        assertThat(encoded).doesNotContain("correct horse battery staple 123");
        assertThat(encoder.matches("correct horse battery staple 123", encoded)).isTrue();
        assertThat(encoder.matches("wrong password", encoded)).isFalse();
    }
}
