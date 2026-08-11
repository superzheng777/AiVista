package com.superz.aivista.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.publication.service.InspirationQueryService;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import com.superz.aivista.user.service.InteractionNotificationService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class InteractionNotificationStateServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-11T12:00:00Z");

    @Test
    void marksMissingInteractionNotificationReadAsNotFound() {
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        when(notifications.markInteractionRead(anyLong(), anyLong(), any())).thenReturn(0);

        assertThatThrownBy(() -> service(notifications).markRead(1L, 2L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void deletesAreIdempotentAndBatchIdsAreDeduplicated() {
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);

        service(notifications).delete(1L, 2L);
        service(notifications).deleteBatch(1L, List.of("2", "3", "2"));

        verify(notifications).softDeleteInteraction(2L, 1L, NOW);
        verify(notifications).softDeleteInteractions(1L, List.of(2L, 3L), NOW);
    }

    @Test
    void returnsCombinedUnreadCounts() {
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        when(notifications.countUnreadOfficialByRecipientUserId(1L)).thenReturn(2L);
        when(notifications.countUnreadInteractionByRecipientUserId(1L)).thenReturn(5L);

        var count = service(notifications).unreadCount(1L);

        assertThat(count.officialUnreadCount()).isEqualTo(2L);
        assertThat(count.interactionUnreadCount()).isEqualTo(5L);
        assertThat(count.totalUnreadCount()).isEqualTo(7L);
    }

    private static InteractionNotificationService service(UserNotificationMapper notifications) {
        return new InteractionNotificationService(notifications, mock(UserMapper.class), mock(GenerationImageMapper.class),
                mock(InspirationQueryService.class), Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
