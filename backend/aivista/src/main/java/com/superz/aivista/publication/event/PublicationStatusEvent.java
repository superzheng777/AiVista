package com.superz.aivista.publication.event;

/** Minimal publication state notification delivered on the authenticated SSE stream. */
public record PublicationStatusEvent(String imageId, long publicationVersion, String status) {
}
