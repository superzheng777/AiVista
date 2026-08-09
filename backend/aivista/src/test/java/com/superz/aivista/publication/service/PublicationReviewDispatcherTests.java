package com.superz.aivista.publication.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class PublicationReviewDispatcherTests {
    private static final Instant NOW = Instant.parse("2026-08-09T12:00:00Z");

    @Test
    void marksImageFailedAndStopsAfterThirdProviderFailure() {
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        PublicationTextModerationClient moderation = mock(PublicationTextModerationClient.class);
        PublicationReviewOutcomeService outcomes = mock(PublicationReviewOutcomeService.class);
        OutboxEvent event = reviewEvent(18L, 42L, 7L, 2);
        GenerationImage image = pendingImage(42L, 5L, 7L);
        when(outbox.selectAvailableByEventType("PUBLICATION_TEXT_REVIEW", NOW, 20)).thenReturn(List.of(event));
        when(outbox.claimPending(18L, NOW, NOW)).thenReturn(1);
        when(images.selectByImageId(42L)).thenReturn(image);
        when(images.incrementPublicationReviewAttemptCount(42L, 7L)).thenReturn(1);
        when(moderation.moderate("title", "publication-42-title"))
                .thenThrow(new PublicationTextModerationException(new RuntimeException("timeout")));

        dispatcher(outbox, images, moderation, outcomes).dispatch();

        verify(outcomes).fail(image, 7L);
        verify(outbox).markFailed(18L, "PublicationTextModerationException");
    }

    private static PublicationReviewDispatcher dispatcher(OutboxEventMapper outbox, GenerationImageMapper images,
            PublicationTextModerationClient moderation, PublicationReviewOutcomeService outcomes) {
        return new PublicationReviewDispatcher(outbox, images, moderation, outcomes, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static OutboxEvent reviewEvent(long id, long imageId, long version, int retryCount) {
        OutboxEvent event = new OutboxEvent();
        event.setId(id);
        event.setAggregateId(imageId);
        event.setAggregateVersion(version);
        event.setRetryCount(retryCount);
        return event;
    }

    private static GenerationImage pendingImage(long id, long userId, long version) {
        GenerationImage image = new GenerationImage();
        image.setId(id);
        image.setUserId(userId);
        image.setPublicationVersion(version);
        image.setPublicationReviewStatus("PENDING");
        image.setPublicationTitle("title");
        image.setPublicationDescription("description");
        return image;
    }
}
