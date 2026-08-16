package com.superz.aivista.search.service;

import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.search.model.SearchIndexDocument;

final class SearchIndexProjectionMapper {
    private SearchIndexProjectionMapper() { }

    static SearchIndexDocument toDocument(GenerationImage image) {
        return new SearchIndexDocument(
                image.getId(),
                SearchTextNormalizer.toSearchText(image.getPublicationTitle()),
                SearchTextNormalizer.toSearchText(image.getPublicationPrompt()),
                image.getLikeCount() == null ? 0 : image.getLikeCount(),
                image.getPublicAt().toEpochMilli());
    }
}
