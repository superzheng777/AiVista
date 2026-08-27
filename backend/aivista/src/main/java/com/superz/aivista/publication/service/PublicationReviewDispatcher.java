package com.superz.aivista.publication.service;

import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.publication.model.PublicationViolation;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Dispatches text-review jobs without holding a database transaction during the remote call. */
@Service
public class PublicationReviewDispatcher {
    private static final int MAX_REVIEW_ATTEMPTS = 3;
    private static final long PROCESSING_LEASE_SECONDS = 120;

    private final OutboxEventMapper outbox;
    private final ImageAssetMapper images;
    private final PublicationTextModerationClient moderation;
    private final PublicationReviewOutcomeService outcomes;
    private final Clock clock;

    public PublicationReviewDispatcher(OutboxEventMapper outbox, ImageAssetMapper images,
            PublicationTextModerationClient moderation, PublicationReviewOutcomeService outcomes, Clock clock) {
        this.outbox = outbox;
        this.images = images;
        this.moderation = moderation;
        this.outcomes = outcomes;
        this.clock = clock;
    }

    @Scheduled(fixedDelay = 1000)
    public void dispatch() {
        Instant now = clock.instant();
        recoverExpiredLeases(now);
        for (OutboxEvent event : outbox.selectAvailableByEventType(
                OutboxEventType.PUBLICATION_TEXT_REVIEW.name(), now, 20)) {
            if (outbox.claimPending(event.getId(), now, now) == 1) {
                review(event, now);
            }
        }
    }

    private void recoverExpiredLeases(Instant now) {
        for (OutboxEvent event : outbox.selectProcessingLockedBefore(
                OutboxEventType.PUBLICATION_TEXT_REVIEW.name(), now.minusSeconds(PROCESSING_LEASE_SECONDS), 20)) {
            ImageAsset image = images.selectByAssetId(event.getAggregateId());
            if (!isCurrentPendingReview(image, event)) {
                outbox.markPublished(event.getId(), now);
                continue;
            }
            int attempts = event.getRetryCount() + 1;
            if (attempts >= MAX_REVIEW_ATTEMPTS) {
                outcomes.fail(image, event.getAggregateVersion());
                outbox.markFailed(event.getId(), "Publication review worker lease expired");
            } else {
                outbox.reschedule(event.getId(), attempts, now, "Publication review worker lease expired");
            }
        }
    }

    private void review(OutboxEvent event, Instant now) {
        ImageAsset image = images.selectByAssetId(event.getAggregateId());
        if (!isCurrentPendingReview(image, event)) {
            outbox.markPublished(event.getId(), now);
            return;
        }
        try {
            if (images.incrementPublicationReviewAttemptCount(image.getId(), event.getAggregateVersion()) != 1) {
                outbox.markPublished(event.getId(), now);
                return;
            }
            PublicationTextModerationClient.ModerationResult titleResult = moderation.moderate(
                    image.getPublicationTitle(), "publication-" + image.getId() + "-title");
            PublicationTextModerationClient.ModerationResult descriptionResult = moderation.moderate(
                    image.getPublicationDescription(), "publication-" + image.getId() + "-description");
            List<PublicationViolation> violations = violations(titleResult, descriptionResult);
            if (violations.isEmpty()) {
                outcomes.approve(image, event.getAggregateVersion());
            } else {
                outcomes.reject(image, event.getAggregateVersion(), violations);
            }
            outbox.markPublished(event.getId(), clock.instant());
        } catch (Exception exception) {
            int attempts = event.getRetryCount() + 1;
            if (attempts >= MAX_REVIEW_ATTEMPTS) {
                outcomes.fail(image, event.getAggregateVersion());
                outbox.markFailed(event.getId(), exception.getClass().getSimpleName());
                return;
            }
            outbox.reschedule(event.getId(), attempts, now.plusSeconds(30), exception.getClass().getSimpleName());
        }
    }

    private static boolean isCurrentPendingReview(ImageAsset image, OutboxEvent event) {
        return image != null
                && "PENDING".equals(image.getPublicationReviewStatus())
                && event.getAggregateVersion().equals(image.getPublicationVersion());
    }

    private static List<PublicationViolation> violations(
            PublicationTextModerationClient.ModerationResult titleResult,
            PublicationTextModerationClient.ModerationResult descriptionResult) {
        List<PublicationViolation> violations = new ArrayList<>();
        if (!titleResult.isAllowed()) {
            violations.add(new PublicationViolation("title", reasonCode(titleResult.labels())));
        }
        if (!descriptionResult.isAllowed()) {
            violations.add(new PublicationViolation("description", reasonCode(descriptionResult.labels())));
        }
        return violations;
    }

    private static String reasonCode(List<String> labels) {
        return labels.stream().map(String::toLowerCase)
                .anyMatch(label -> label.contains("personal") || label.contains("privacy"))
                ? "SENSITIVE_INFO" : "CONTENT_POLICY";
    }
}
