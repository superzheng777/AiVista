package com.superz.aivista.publication.model;

/** Safe field-level publication feedback; it intentionally excludes provider labels and matched words. */
public record PublicationViolation(String field, String reasonCode) {
}
