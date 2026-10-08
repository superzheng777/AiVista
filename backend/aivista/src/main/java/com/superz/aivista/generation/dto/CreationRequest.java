package com.superz.aivista.generation.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Ordinary generation and Agent creation share one request contract. */
public record CreationRequest(
        @Pattern(regexp = "[1-9][0-9]*") String sessionId,
        @NotNull @Pattern(regexp = "NORMAL|AGENT") String mode,
        @NotNull @Valid Input input,
        @Valid Settings settings) {
    public record Input(@NotBlank @Size(max = 1000) String prompt,
            @Size(max = 3) List<@Pattern(regexp = "[1-9][0-9]*") String> assetIds) {}
    public record Settings(String aspectRatio, Integer imageCount, String negativePrompt, Boolean promptExtend) {}
}
