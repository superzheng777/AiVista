package com.superz.aivista.generation.service;

import com.fasterxml.jackson.databind.JsonNode;
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
            "id", "type", "label", "required", "initialValue", "placeholder");
    private static final Set<String> SELECT_KEYS = Set.of(
            "id", "type", "label", "required", "initialValue", "options", "allowCustom",
            "customLabel", "customInitialValue");
    private static final Set<String> OPTION_KEYS = Set.of("value", "label");
    private static final Set<String> ANSWER_KEYS = Set.of("kind", "value");

    public JsonNode validateForm(JsonNode value) {
        requireObject(value, "form");
        requireExactKeys(value, FORM_KEYS, "form");
        JsonNode version = value.get("schemaVersion");
        if (version == null || !version.isIntegralNumber() || version.intValue() != 1) {
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
                optionalText(field.get("initialValue"), 300, "initialValue");
                optionalText(field.get("placeholder"), 100, "placeholder");
            } else if ("SINGLE_SELECT".equals(type)) {
                validateSelect(field);
            } else {
                invalid("字段类型只允许 TEXT 或 SINGLE_SELECT");
            }
        }
        return value.deepCopy();
    }

    public JsonNode validateAnswers(JsonNode form, String action, JsonNode answers) {
        if ("SKIP".equals(action)) {
            if (answers != null && !answers.isNull() && (!answers.isObject() || !answers.isEmpty())) {
                invalid("跳过表单时不能提交答案");
            }
            return null;
        }
        if (!"SUBMIT".equals(action)) invalid("action 只允许 SUBMIT 或 SKIP");
        requireObject(answers, "answers");
        Set<String> fieldIds = new HashSet<>();
        for (JsonNode field : form.path("fields")) fieldIds.add(field.path("id").asText());
        answers.fieldNames().forEachRemaining(id -> {
            if (!fieldIds.contains(id)) invalid("答案包含未知字段：" + id);
        });
        for (JsonNode field : form.path("fields")) {
            String id = field.path("id").asText();
            JsonNode answer = answers.get(id);
            if (answer == null || answer.isNull()) {
                if (field.path("required").asBoolean()) invalid("缺少必填字段：" + id);
                continue;
            }
            requireObject(answer, "answer");
            requireExactKeys(answer, ANSWER_KEYS, "answer");
            String kind = text(answer.get("kind"), "kind");
            String value = text(answer.get("value"), "value");
            if (value.codePointCount(0, value.length()) > 300) invalid("答案内容过长：" + id);
            if ("TEXT".equals(field.path("type").asText())) {
                if (!"TEXT".equals(kind)) invalid("文本字段答案类型错误：" + id);
                if (field.path("required").asBoolean() && value.isBlank()) invalid("必填字段不能为空：" + id);
                continue;
            }
            if ("OPTION".equals(kind)) {
                boolean exists = false;
                for (JsonNode option : field.path("options")) {
                    if (value.equals(option.path("value").asText())) { exists = true; break; }
                }
                if (!exists) invalid("单选答案不在允许选项中：" + id);
            } else if ("CUSTOM".equals(kind)) {
                if (!field.path("allowCustom").asBoolean() || value.isBlank()) {
                    invalid("该字段不允许空白的自定义答案：" + id);
                }
            } else {
                invalid("单选字段答案类型错误：" + id);
            }
        }
        return answers.deepCopy();
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
        JsonNode initial = field.get("initialValue");
        if (initial != null && !initial.isNull()) {
            String value = text(initial, "initialValue");
            if (!values.contains(value)) invalid("initialValue 必须来自 options");
        }
        boolean allowCustom = field.path("allowCustom").asBoolean();
        optionalText(field.get("customLabel"), 20, "customLabel");
        optionalText(field.get("customInitialValue"), 300, "customInitialValue");
        if (!allowCustom && (field.has("customLabel") || field.has("customInitialValue"))) {
            invalid("未开放自定义选项时不能提供自定义配置");
        }
    }

    private static void requireExactKeys(JsonNode value, Set<String> allowed, String field) {
        Iterator<String> names = value.fieldNames();
        while (names.hasNext()) if (!allowed.contains(names.next())) invalid(field + " 包含未知字段");
        for (String required : switch (field) {
            case "form" -> Set.of("schemaVersion", "title", "fields");
            case "field" -> Set.of("id", "type", "label", "required");
            case "option", "answer" -> allowed;
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

    private static void optionalText(JsonNode value, int max, String field) {
        if (value == null) return;
        if (!value.isTextual() || value.textValue().codePointCount(0, value.textValue().length()) > max) {
            invalid(field + " 长度无效");
        }
    }

    private static void invalid(String message) {
        throw new BusinessException(ErrorCode.VALIDATION_ERROR, message);
    }
}
