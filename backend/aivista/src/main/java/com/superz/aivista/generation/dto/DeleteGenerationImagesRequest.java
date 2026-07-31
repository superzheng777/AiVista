package com.superz.aivista.generation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/** 删除当前用户手动勾选的生成资产图片。 */
public record DeleteGenerationImagesRequest(
        @NotEmpty(message = "不能为空") List<@NotBlank(message = "不能为空") String> imageIds) {
}
