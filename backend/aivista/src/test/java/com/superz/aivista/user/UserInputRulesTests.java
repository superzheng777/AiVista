package com.superz.aivista.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.user.service.UserInputRules;
import org.junit.jupiter.api.Test;

class UserInputRulesTests {

    @Test
    void normalizesAndAcceptsValidLoginName() {
        String loginName = UserInputRules.normalizeLoginName("  Alice_123  ");

        UserInputRules.requireValidLoginName(loginName);

        assertThat(loginName).isEqualTo("Alice_123");
    }

    @Test
    void rejectsInvalidLoginNameAndPassword() {
        assertThatThrownBy(() -> UserInputRules.requireValidLoginName("1alice"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> UserInputRules.requireValidPassword("password"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void normalizesNicknameAndRejectsControlCharacters() {
        assertThat(UserInputRules.requireValidNickname("  SuperZ  ")).isEqualTo("SuperZ");

        assertThatThrownBy(() -> UserInputRules.requireValidNickname("bad\nname"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void acceptsNullableProfileTextAndRejectsOversizeText() {
        UserInputRules.requireValidProfileText("bio", null, 500);

        assertThatThrownBy(() -> UserInputRules.requireValidProfileText("bio", "x".repeat(501), 500))
                .isInstanceOf(BusinessException.class);
    }
}
