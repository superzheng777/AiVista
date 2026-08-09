package com.superz.aivista.publication.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RequestPublicationRequest(
        @NotBlank @Size(max = 100) String title,
        @NotBlank @Size(max = 500) String description) {
}
