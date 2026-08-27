package com.superz.aivista.publication.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;

import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.publication.model.PublicationViolation;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class PublicationReviewOutcomeServiceTests {
    @Test
    void approvalCreatesOfficialMessageAndReliableSseEvent() {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        ImageAsset image = new ImageAsset();
        image.setId(42L);
        image.setUserId(5L);
        when(images.approvePublication(42L, 7L, Instant.parse("2026-08-09T12:00:00Z"))).thenReturn(1);

        new PublicationReviewOutcomeService(images, outbox, notifications,
                Clock.fixed(Instant.parse("2026-08-09T12:00:00Z"), ZoneOffset.UTC),
                new com.fasterxml.jackson.databind.ObjectMapper()).approve(image, 7L);

        ArgumentCaptor<UserNotification> notification = ArgumentCaptor.forClass(UserNotification.class);
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(notifications).insertSelective(notification.capture());
        verify(outbox, times(2)).insertSelective(event.capture());
        org.assertj.core.api.Assertions.assertThat(notification.getValue().getEventType()).isEqualTo("PUBLICATION_APPROVED");
        org.assertj.core.api.Assertions.assertThat(event.getAllValues())
                .extracting(OutboxEvent::getEventType)
                .containsExactly("PUBLICATION_STATUS_CHANGED", "PUBLICATION_SEARCH_INDEX_SYNC");
        org.assertj.core.api.Assertions.assertThat(event.getAllValues().getFirst().getPayloadJson())
                .isEqualTo("{\"status\":\"APPROVED\"}");
    }

    @Test
    void rejectionStoresSafeFieldLevelMetadata() {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        ImageAsset image = new ImageAsset();
        image.setId(42L);
        image.setUserId(5L);
        Instant now = Instant.parse("2026-08-09T12:00:00Z");
        when(images.rejectPublication(42L, 7L)).thenReturn(1);

        new PublicationReviewOutcomeService(images, outbox, notifications, Clock.fixed(now, ZoneOffset.UTC),
                new com.fasterxml.jackson.databind.ObjectMapper()).reject(image, 7L, List.of(
                        new PublicationViolation("title", "CONTENT_POLICY"),
                        new PublicationViolation("description", "SENSITIVE_INFO")));

        ArgumentCaptor<UserNotification> notification = ArgumentCaptor.forClass(UserNotification.class);
        verify(notifications).insertSelective(notification.capture());
        org.assertj.core.api.Assertions.assertThat(notification.getValue().getMetadataJson())
                .isEqualTo("{\"violations\":[{\"field\":\"title\",\"reasonCode\":\"CONTENT_POLICY\"},{\"field\":\"description\",\"reasonCode\":\"SENSITIVE_INFO\"}]}");
    }
}
