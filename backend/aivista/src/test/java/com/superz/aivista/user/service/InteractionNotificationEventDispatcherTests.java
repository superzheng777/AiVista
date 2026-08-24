package com.superz.aivista.user.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.config.GenerationSseProperties;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.service.GenerationSseConnectionService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class InteractionNotificationEventDispatcherTests {
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");

    @Test
    void marksValidNotificationsPublishedInOneBatch() {
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        OutboxEvent first = event(11L);
        OutboxEvent second = event(12L);
        when(outbox.selectAvailableByEventType("INTERACTION_NOTIFICATION_CREATED", NOW, 100))
                .thenReturn(List.of(first, second));
        when(outbox.claimPending(11L, NOW, NOW)).thenReturn(1);
        when(outbox.claimPending(12L, NOW, NOW)).thenReturn(1);

        dispatcher(outbox).dispatchAvailableEvents();

        verify(outbox).markPublishedBatch(List.of(11L, 12L), NOW);
    }

    @Test
    void requeuesExpiredNotificationsInOneBatch() {
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        OutboxEvent stale = event(11L);
        stale.setRetryCount(2);
        when(outbox.selectProcessingLockedBefore("INTERACTION_NOTIFICATION_CREATED", NOW.minusSeconds(30), 100))
                .thenReturn(List.of(stale));

        dispatcher(outbox).dispatchAvailableEvents();

        verify(outbox).rescheduleBatch(List.of(stale), "SSE interaction notification processing lease expired");
        org.assertj.core.api.Assertions.assertThat(stale.getRetryCount()).isEqualTo(3);
        org.assertj.core.api.Assertions.assertThat(stale.getAvailableAt()).isEqualTo(NOW);
    }

    private static InteractionNotificationEventDispatcher dispatcher(OutboxEventMapper outbox) {
        return new InteractionNotificationEventDispatcher(outbox, mock(GenerationSseConnectionService.class), properties(),
                Clock.fixed(NOW, ZoneOffset.UTC), new ObjectMapper());
    }

    private static GenerationSseProperties properties() {
        return new GenerationSseProperties(3, 1000, Duration.ofSeconds(15), Duration.ofSeconds(1), 100,
                Duration.ofSeconds(30));
    }

    private static OutboxEvent event(long id) {
        OutboxEvent event = new OutboxEvent();
        event.setId(id);
        event.setPayloadJson("{\"recipientUserId\":7,\"notificationId\":\"101\"}");
        return event;
    }
}
