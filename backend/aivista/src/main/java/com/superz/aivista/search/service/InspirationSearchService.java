package com.superz.aivista.search.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.publication.service.InspirationQueryService;
import com.superz.aivista.search.client.MeilisearchSearchClient;
import com.superz.aivista.search.client.MeilisearchSearchException;
import com.superz.aivista.search.dto.InspirationSearchPageResponse;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class InspirationSearchService {
    private static final int FIRST_PAGE_SIZE = 20;
    private static final int NEXT_PAGE_SIZE = 40;
    private static final int MAX_OFFSET = 200;
    private final MeilisearchSearchClient searchClient;
    private final GenerationImageMapper images;
    private final InspirationQueryService inspirationQuery;

    public InspirationSearchService(MeilisearchSearchClient searchClient, GenerationImageMapper images,
            InspirationQueryService inspirationQuery) {
        this.searchClient = searchClient;
        this.images = images;
        this.inspirationQuery = inspirationQuery;
    }

    public InspirationSearchPageResponse search(String submittedQuery, Integer requestedOffset, Long viewerUserId) {
        String normalized = SearchTextNormalizer.normalizeSubmitted(submittedQuery);
        if (normalized.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "搜索关键词不能为空");
        if (normalized.codePointCount(0, normalized.length()) > 100) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "搜索关键词不能超过 100 个字符");
        }
        int offset = requestedOffset == null ? 0 : requestedOffset;
        if (offset < 0 || offset >= MAX_OFFSET) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "offset 必须在 0 到 199 之间");
        }
        int pageSize = requestedOffset == null ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE;
        String safeQuery = SearchTextNormalizer.toSearchText(normalized);
        try {
            return collect(safeQuery, offset, pageSize, viewerUserId);
        } catch (MeilisearchSearchException exception) {
            throw new BusinessException(ErrorCode.SEARCH_UNAVAILABLE);
        }
    }

    private InspirationSearchPageResponse collect(String query, int startOffset, int pageSize, Long viewerUserId) {
        List<GenerationImage> collected = new ArrayList<>(pageSize);
        Set<Long> seen = new HashSet<>();
        int rawOffset = startOffset;
        boolean exhausted = false;
        while (collected.size() < pageSize && rawOffset < MAX_OFFSET && !exhausted) {
            int limit = Math.min(pageSize, MAX_OFFSET - rawOffset);
            List<Long> hitIds = searchClient.search(query, rawOffset, limit);
            if (hitIds.isEmpty()) {
                exhausted = true;
                break;
            }
            List<Long> uniqueIds = hitIds.stream().filter(seen::add).toList();
            Map<Long, GenerationImage> validById = uniqueIds.isEmpty() ? Map.of()
                    : images.selectPublishedByIds(uniqueIds).stream().collect(java.util.stream.Collectors.toMap(
                            GenerationImage::getId, image -> image, (first, ignored) -> first, LinkedHashMap::new));
            for (Long imageId : hitIds) {
                rawOffset++;
                GenerationImage image = validById.get(imageId);
                if (image != null && collected.stream().noneMatch(item -> item.getId().equals(imageId))) {
                    collected.add(image);
                    if (collected.size() == pageSize) break;
                }
            }
            exhausted = hitIds.size() < limit;
        }
        List<GenerationAssetImageResponse> items = inspirationQuery.toPublicImages(collected, viewerUserId);
        Integer nextOffset = exhausted || rawOffset >= MAX_OFFSET ? null : rawOffset;
        return new InspirationSearchPageResponse(items, nextOffset);
    }
}
