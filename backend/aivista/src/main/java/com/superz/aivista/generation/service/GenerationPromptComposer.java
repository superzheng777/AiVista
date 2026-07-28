package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationMessage;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** 按字符预算将当前输入与最近会话历史拼接为模型最终提示词。 */
final class GenerationPromptComposer {
    private static final String SEPARATOR = "\n\n";

    private GenerationPromptComposer() {
    }

    static String compose(String current, List<GenerationMessage> newestFirstHistory,
            int maxCodePoints, boolean negative) {
        // Mapper 按最新到最早返回；从最新开始纳入，保证预算不足时优先保留最近上下文。
        List<String> selectedNewestFirst = new ArrayList<>();
        selectedNewestFirst.add(current);
        int used = codePointCount(current);

        for (GenerationMessage message : newestFirstHistory) {
            String historical = negative ? message.getNegativePrompt() : message.getPrompt();
            if (historical == null || historical.isBlank()) {
                continue;
            }
            int next = codePointCount(historical);
            if (used + codePointCount(SEPARATOR) + next > maxCodePoints) {
                // 历史消息只能整条保留，绝不截断，且不再继续读取更早的上下文。
                break;
            }
            selectedNewestFirst.add(historical);
            used += codePointCount(SEPARATOR) + next;
        }

        // 模型输入仍按“最早历史 → 当前输入”的时间顺序组织。
        Collections.reverse(selectedNewestFirst);
        return String.join(SEPARATOR, selectedNewestFirst);
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
