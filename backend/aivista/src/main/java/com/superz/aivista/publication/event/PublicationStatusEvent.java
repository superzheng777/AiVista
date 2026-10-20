package com.superz.aivista.publication.event;

import java.time.Instant;

/** Minimal publication state notification delivered on the authenticated WebSocket stream. */
public record PublicationStatusEvent(String imageId, long publicationVersion, String status, Instant publicAt) {
}
