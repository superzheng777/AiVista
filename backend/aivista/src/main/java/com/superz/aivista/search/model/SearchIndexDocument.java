package com.superz.aivista.search.model;

public record SearchIndexDocument(long imageId, String title, String finalPrompt, long likeCount, long publicAt) { }
