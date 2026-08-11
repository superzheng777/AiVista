package com.superz.aivista.publication.dto;

import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import java.time.Instant;

public record LikedPublicationResponse(GenerationAssetImageResponse image, Instant likedAt) {
}
