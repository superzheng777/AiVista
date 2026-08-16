package com.superz.aivista.search.client;

public class MeilisearchSearchException extends RuntimeException {
    public MeilisearchSearchException(Throwable cause) {
        super("Meilisearch search request failed", cause);
    }
}
