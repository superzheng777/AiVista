package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;

class GenerationPromptValidatorTests {

    @Test
    void rejectsBlankRequiredPromptAndCodePointOverflow() {
        assertThatThrownBy(() -> GenerationPromptValidator.requireValidPrompt("prompt", " ", 3, true))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        assertThatThrownBy(() -> GenerationPromptValidator.requireValidPrompt("prompt", "😀😀", 1, true))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }
}
