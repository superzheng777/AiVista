package com.superz.aivista.search.dto;

import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import java.util.List;

public record InspirationSearchPageResponse(List<GenerationAssetImageResponse> items, Integer nextOffset) { }
