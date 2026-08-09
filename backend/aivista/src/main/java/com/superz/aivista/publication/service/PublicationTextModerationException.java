package com.superz.aivista.publication.service;

public class PublicationTextModerationException extends RuntimeException {
    public PublicationTextModerationException(Throwable cause) {
        super("Publication text moderation request failed", cause);
    }
}
