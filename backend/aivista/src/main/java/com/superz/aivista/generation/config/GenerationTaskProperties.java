package com.superz.aivista.generation.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** 普通文生图任务创建阶段的固定模型能力与用户侧限制。 */
@Validated
@ConfigurationProperties(prefix = "app.generation.task")
public record GenerationTaskProperties(
        @NotBlank String model,
        @Positive int maxActiveTasksPerUser,
        @Positive int dailyImageQuota,
        @Positive int maxPromptCodePoints,
        @Positive int maxNegativePromptCodePoints,
        @Min(1) int minImageCount,
        @Max(6) int maxImageCount,
        /** 画幅标识到“宽*高”模型参数的白名单映射。 */
        @NotEmpty Map<String, String> aspectRatios) {

    public GenerationTaskProperties {
        // 防止配置在运行期间被外部可变 Map 修改，确保校验与实际请求使用同一份能力定义。
        aspectRatios = Map.copyOf(aspectRatios);
        if (minImageCount > maxImageCount) {
            throw new IllegalArgumentException("minImageCount must not exceed maxImageCount");
        }
    }
}
