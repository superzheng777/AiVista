package com.superz.aivista.user.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;

/** 用户模块输入规范化与业务校验。 */
public final class UserInputRules {
    private static final String LOGIN_NAME_PATTERN = "^[A-Za-z][A-Za-z0-9_]{3,31}$";

    private UserInputRules() {
    }

    public static String normalizeLoginName(String loginName) {
        return loginName == null ? null : loginName.strip();
    }

    public static String normalizeNickname(String nickname) {
        return nickname == null ? null : nickname.strip();
    }

    public static void requireValidLoginName(String loginName) {
        if (loginName == null || !loginName.matches(LOGIN_NAME_PATTERN)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "loginName：必须以字母开头，且只能包含4到32位字母、数字或下划线");
        }
    }

    public static void requireValidPassword(String password) {
        if (password == null || password.isBlank() || codePointLength(password) < 8 || codePointLength(password) > 64
                || password.codePoints().noneMatch(Character::isLetter)
                || password.codePoints().noneMatch(Character::isDigit)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "password：必须为8到64个字符，且至少包含一个字母和一个数字");
        }
    }

    public static String requireValidNickname(String nickname) {
        String normalized = normalizeNickname(nickname);
        if (normalized == null || codePointLength(normalized) < 1 || codePointLength(normalized) > 32
                || containsControlCharacter(normalized)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "nickname：必须为1到32个字符，且不能包含控制字符");
        }
        return normalized;
    }

    public static void requireValidProfileText(String field, String value, int maxCodePoints) {
        if (value != null && (codePointLength(value) > maxCodePoints || containsControlCharacter(value))) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, field + "：长度或字符不符合要求");
        }
    }

    private static int codePointLength(String value) {
        return value.codePointCount(0, value.length());
    }

    private static boolean containsControlCharacter(String value) {
        return value.codePoints().anyMatch(Character::isISOControl);
    }
}
