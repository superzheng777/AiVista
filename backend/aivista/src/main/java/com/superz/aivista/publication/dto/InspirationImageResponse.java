package com.superz.aivista.publication.dto;
import java.time.Instant;
public record InspirationImageResponse(String imageId, String url, Instant urlExpiresAt, int width, int height, Instant publicAt, String title, String description, String prompt, String negativePrompt, int requestedImageCount, boolean promptExtend) {}
