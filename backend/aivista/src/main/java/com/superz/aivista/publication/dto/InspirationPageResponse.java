package com.superz.aivista.publication.dto;

import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import java.util.List;

/** 公开灵感流的固定页大小游标响应。 */
public record InspirationPageResponse(List<GenerationAssetImageResponse> items, String nextCursor) {
}
