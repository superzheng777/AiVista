package com.superz.aivista.generation.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Validates the small, fixed form protocol shared by Pi, Java and the browser. */
@Component
public class AgentFormSchemaValidator {
    private static final Pattern FIELD_ID = Pattern.compile("^[a-z][a-zA-Z0-9_]{0,31}$");
    private static final Pattern OPTION_VALUE = Pattern.compile("^[A-Z][A-Z0-9_]{0,31}$");
    private static final Set<String> FORM_KEYS = Set.of("schemaVersion", "title", "fields");
    private static final Set<String> TEXT_KEYS = Set.of(
            "id", "type", "label", "required", "value", "placeholder");
    private static final Set<String> SELECT_KEYS = Set.of(
            "id", "type", "label", "required", "value", "options", "allowCustom", "customLabel");
    private static final Set<String> OPTION_KEYS = Set.of("value", "label");

    public JsonNode validateForm(JsonNode value) {
        requireObject(value, "form");
        requireExactKeys(value, FORM_KEYS, "form");
        JsonNode version = value.get("schemaVersion");
        if (version == null || !version.isIntegralNumber() || version.intValue() != 2) {
            invalid("不支持的表单版本");
        }
        requireText(value.get("title"), 1, 60, "title");
        JsonNode fields = value.get("fields");
        if (fields == null || !fields.isArray() || fields.isEmpty() || fields.size() > 8) {
            invalid("fields 必须包含 1 至 8 个字段");
        }
        Set<String> ids = new HashSet<>();
        for (JsonNode field : fields) {
            requireObject(field, "field");
            String type = text(field.get("type"), "type");
            requireExactKeys(field, "TEXT".equals(type) ? TEXT_KEYS : SELECT_KEYS, "field");
            String id = text(field.get("id"), "id");
            if (!FIELD_ID.matcher(id).matches() || !ids.add(id)) invalid("表单字段 ID 无效或重复");
            requireText(field.get("label"), 1, 40, "label");
            requireBoolean(field.get("required"), "required");
            if ("TEXT".equals(type)) {
                requireTextAllowBlank(field.get("value"), 300, "value");
                optionalText(field.get("placeholder"), 100, "placeholder");
            } else if ("SINGLE_SELECT".equals(type)) {
                validateSelect(field);
            } else {
                invalid("字段类型只允许 TEXT 或 SINGLE_SELECT");
            }
        }
        return value.deepCopy();
    }

    public JsonNode validateSubmission(JsonNode storedForm, JsonNode submittedForm) {
        JsonNode normalizedStored = validateForm(storedForm);
        JsonNode normalizedSubmitted = validateForm(submittedForm);
        if (!withoutValues(normalizedStored).equals(withoutValues(normalizedSubmitted))) {
            invalid("提交的表单定义与待处理表单不一致");
        }
        for (JsonNode field : normalizedSubmitted.path("fields")) {
            if (field.path("required").asBoolean() && field.path("value").asText().isBlank()) {
                invalid("必填字段不能为空：" + field.path("id").asText());
            }
        }
        return normalizedSubmitted;
    }

    public boolean hasSameDefinition(JsonNode first, JsonNode second) {
        return withoutValues(validateForm(first)).equals(withoutValues(validateForm(second)));
    }

    private static void validateSelect(JsonNode field) {
        requireBoolean(field.get("allowCustom"), "allowCustom");
        JsonNode options = field.get("options");
        if (options == null || !options.isArray() || options.size() < 2 || options.size() > 8) {
            invalid("单选字段必须包含 2 至 8 个选项");
        }
        Set<String> values = new HashSet<>();
        for (JsonNode option : options) {
            requireObject(option, "option");
            requireExactKeys(option, OPTION_KEYS, "option");
            String value = text(option.get("value"), "option.value");
            if (!OPTION_VALUE.matcher(value).matches() || !values.add(value)) invalid("单选值无效或重复");
            requireText(option.get("label"), 1, 40, "option.label");
        }
        String selected = requireTextAllowBlank(field.get("value"), 300, "value");
        boolean allowCustom = field.path("allowCustom").asBoolean();
        optionalNonBlankText(field.get("customLabel"), 20, "customLabel");
        if (!allowCustom && field.has("customLabel")) {
            invalid("未开放自定义选项时不能提供自定义配置");
        }
        if (!selected.isEmpty() && !values.contains(selected) && !allowCustom) {
            invalid("value 必须来自 options");
        }
    }

    private static JsonNode withoutValues(JsonNode form) {
        JsonNode definition = form.deepCopy();
        for (JsonNode field : definition.path("fields")) {
            ((ObjectNode) field).remove("value");
        }
        return definition;
    }

    private static void requireExactKeys(JsonNode value, Set<String> allowed, String field) {
        Iterator<String> names = value.fieldNames();
        while (names.hasNext()) if (!allowed.contains(names.next())) invalid(field + " 包含未知字段");
        for (String required : switch (field) {
            case "form" -> Set.of("schemaVersion", "title", "fields");
            case "field" -> Set.of("id", "type", "label", "required", "value");
            case "option" -> allowed;
            default -> Set.<String>of();
        }) if (!value.has(required)) invalid(field + " 缺少字段 " + required);
    }

    private static void requireObject(JsonNode value, String field) {
        if (value == null || !value.isObject()) invalid(field + " 必须是对象");
    }

    private static void requireBoolean(JsonNode value, String field) {
        if (value == null || !value.isBoolean()) invalid(field + " 必须是布尔值");
    }

    private static String text(JsonNode value, String field) {
        if (value == null || !value.isTextual()) invalid(field + " 必须是字符串");
        return value.textValue();
    }

    private static void requireText(JsonNode value, int min, int max, String field) {
        String text = text(value, field);
        int length = text.codePointCount(0, text.length());
        if (length < min || length > max || text.isBlank()) invalid(field + " 长度无效");
    }

    private static String requireTextAllowBlank(JsonNode value, int max, String field) {
        String text = text(value, field);
        if (text.codePointCount(0, text.length()) > max) invalid(field + " 长度无效");
        return text;
    }

    private static void optionalText(JsonNode value, int max, String field) {
        if (value == null) return;
        if (!value.isTextual() || value.textValue().codePointCount(0, value.textValue().length()) > max) {
            invalid(field + " 长度无效");
        }
    }

    private static void optionalNonBlankText(JsonNode value, int max, String field) {
        if (value == null) return;
        requireText(value, 1, max, field);
    }

    private static void invalid(String message) {
        throw new BusinessException(ErrorCode.VALIDATION_ERROR, message);
    }
}
