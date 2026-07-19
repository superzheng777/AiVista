package com.superz.aivista.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.superz.aivista.auth.token.GeneratedRefreshToken;
import com.superz.aivista.auth.token.RefreshTokenService;
import java.security.SecureRandom;
import org.junit.jupiter.api.Test;

class RefreshTokenServiceTests {

    @Test
    void generatesUrlSafeTokenAndStableSha256Hash() {
        RefreshTokenService service = new RefreshTokenService(new SecureRandom(), TestAuthProperties.create());

        GeneratedRefreshToken first = service.generate();
        GeneratedRefreshToken second = service.generate();

        assertThat(first.value()).matches("^[A-Za-z0-9_-]{43}$");
        assertThat(first.hash()).hasSize(32).containsExactly(service.hash(first.value()));
        assertThat(second.value()).isNotEqualTo(first.value());
        assertThat(second.hash()).isNotEqualTo(first.hash());
    }

    @Test
    void returnedHashCannotMutateStoredRecordValue() {
        RefreshTokenService service = new RefreshTokenService(new SecureRandom(), TestAuthProperties.create());
        GeneratedRefreshToken generated = service.generate();
        byte[] exposed = generated.hash();
        exposed[0] ^= 1;

        assertThat(generated.hash()).containsExactly(service.hash(generated.value()));
    }
}
