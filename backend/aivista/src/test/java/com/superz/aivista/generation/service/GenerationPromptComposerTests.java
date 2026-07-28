package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationMessage;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationPromptComposerTests {

    @Test
    void keepsNewestWholeHistoryMessagesWithinBudgetAndReturnsChronologicalOrder() {
        GenerationMessage newest = message("newest-history", "newest-negative");
        GenerationMessage older = message("older-history", "older-negative");

        assertThat(GenerationPromptComposer.compose("current", List.of(newest, older), 24, false))
                .isEqualTo("newest-history\n\ncurrent");
        assertThat(GenerationPromptComposer.compose("current", List.of(newest, older), 40, false))
                .isEqualTo("older-history\n\nnewest-history\n\ncurrent");
    }

    @Test
    void ignoresBlankOptionalNegativeHistory() {
        GenerationMessage message = message("history", " ");

        assertThat(GenerationPromptComposer.compose("current-negative", List.of(message), 100, true))
                .isEqualTo("current-negative");
    }

    @Test
    void rejectsBlankRequiredPromptAndCodePointOverflow() {
        assertThatThrownBy(() -> GenerationPromptComposer.requireValidPrompt("prompt", " ", 3, true))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        assertThatThrownBy(() -> GenerationPromptComposer.requireValidPrompt("prompt", "😀😀", 1, true))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void requestFingerprintUsesUtf8LengthPrefixAndStableFieldOrder() {
        String first = GenerationRequestFingerprint.sha256(7L, "NEW", "你好", null, "1:1", 2);
        String second = GenerationRequestFingerprint.sha256(7L, "NEW", "你好", null, "1:1", 2);
        String changed = GenerationRequestFingerprint.sha256(7L, "NEW", "你好!", null, "1:1", 2);

        assertThat(first).isEqualTo(second).isNotEqualTo(changed).hasSize(64);
    }

    private static GenerationMessage message(String prompt, String negativePrompt) {
        GenerationMessage message = new GenerationMessage();
        message.setPrompt(prompt);
        message.setNegativePrompt(negativePrompt);
        return message;
    }
}
