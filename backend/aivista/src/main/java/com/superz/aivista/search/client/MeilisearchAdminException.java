package com.superz.aivista.search.client;

public class MeilisearchAdminException extends RuntimeException {
    public enum Kind { TRANSIENT, REQUIRES_ACTION, INDEX_NOT_FOUND }

    private final Kind kind;
    private final String errorCode;

    public MeilisearchAdminException(Kind kind, String errorCode, Throwable cause) {
        super("Meilisearch admin request failed: " + (errorCode == null ? "unknown" : errorCode), cause);
        this.kind = kind;
        this.errorCode = errorCode;
    }

    public Kind kind() { return kind; }
    public String errorCode() { return errorCode; }
}
