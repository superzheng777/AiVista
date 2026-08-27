package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;

/** 校验单次生成请求中的提示词长度。 */
final class GenerationPromptValidator {
    private GenerationPromptValidator() {
    }

    static void requireValidPrompt(String field, String value, int maxCodePoints, boolean required) {
        if (value == null) {
            if (required) {
                throw invalid(field);
            }
            return;
        }
        if ((required && value.isBlank()) || codePointCount(value) > maxCodePoints) {
            throw invalid(field);
        }
    }

    static int codePointCount(String value) {
        return value.codePointCount(0, value.length());
    }

    private static BusinessException invalid(String field) {
        return new BusinessException(ErrorCode.VALIDATION_ERROR,
                field + "：不能为空且长度不能超过当前模型限制");
    }
}
