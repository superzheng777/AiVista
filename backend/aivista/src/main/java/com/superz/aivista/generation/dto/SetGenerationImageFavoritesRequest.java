package com.superz.aivista.generation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/** 批量将当前用户的生成图片设置为收藏或非收藏状态。 */
public record SetGenerationImageFavoritesRequest(
        @NotEmpty(message = "不能为空") List<@NotBlank(message = "不能为空") String> imageIds,
        @NotNull(message = "不能为空") Boolean favorite) {
}
