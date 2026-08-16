package com.superz.aivista.search.service;

import java.text.Normalizer;
import java.util.Locale;

public final class SearchTextNormalizer {
    private SearchTextNormalizer() { }

    public static String normalizeSubmitted(String value) {
        if (value == null) return "";
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC);
        StringBuilder result = new StringBuilder(normalized.length());
        boolean pendingSpace = false;
        for (int index = 0; index < normalized.length();) {
            int codePoint = normalized.codePointAt(index);
            index += Character.charCount(codePoint);
            if (Character.isWhitespace(codePoint)) {
                pendingSpace = result.length() > 0;
            } else {
                if (pendingSpace) result.append(' ');
                result.appendCodePoint(codePoint);
                pendingSpace = false;
            }
        }
        return result.toString();
    }

    public static String toSearchText(String value) {
        String normalized = Normalizer.normalize(normalizeSubmitted(value), Normalizer.Form.NFKD)
                .toLowerCase(Locale.ROOT);
        StringBuilder result = new StringBuilder(normalized.length());
        boolean pendingSpace = false;
        for (int index = 0; index < normalized.length();) {
            int codePoint = normalized.codePointAt(index);
            index += Character.charCount(codePoint);
            int type = Character.getType(codePoint);
            if (type == Character.NON_SPACING_MARK || type == Character.COMBINING_SPACING_MARK
                    || type == Character.ENCLOSING_MARK) {
                continue;
            }
            if (Character.isLetterOrDigit(codePoint)) {
                if (pendingSpace && result.length() > 0) result.append(' ');
                result.appendCodePoint(codePoint);
                pendingSpace = false;
            } else {
                pendingSpace = result.length() > 0;
            }
        }
        return result.toString();
    }
}
