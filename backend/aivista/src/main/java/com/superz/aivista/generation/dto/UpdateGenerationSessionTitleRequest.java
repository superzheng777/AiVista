package com.superz.aivista.generation.dto;

import jakarta.validation.constraints.NotNull;

/** 修改当前用户生成会话的展示标题。 */
public record UpdateGenerationSessionTitleRequest(@NotNull String title) {
}
