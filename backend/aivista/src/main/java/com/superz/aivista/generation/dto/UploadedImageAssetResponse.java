package com.superz.aivista.generation.dto;

import java.time.Instant;

public record UploadedImageAssetResponse(String assetId, Instant expiresAt) { }
