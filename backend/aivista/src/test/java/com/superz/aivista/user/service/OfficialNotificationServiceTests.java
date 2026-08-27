package com.superz.aivista.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.service.GenerationAssetQueryService;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class OfficialNotificationServiceTests {
    private static final long USER_ID = 7L;
    private final UserNotificationMapper notificationMapper = mock(UserNotificationMapper.class);
    private final GenerationAssetQueryService assets = mock(GenerationAssetQueryService.class);
    private final OfficialNotificationService service = new OfficialNotificationService(
            notificationMapper,
            assets,
            new ObjectMapper(),
            Clock.fixed(Instant.parse("2026-08-09T00:00:00Z"), ZoneOffset.UTC));

    @Test
    void listsAllOfficialNotificationsWithStructuredMetadata() {
        UserNotification notification = new UserNotification();
        notification.setId(11L);
        notification.setEventType("PUBLICATION_REJECTED");
        notification.setImageId(21L);
        notification.setTitle("发布未通过");
        notification.setContent("请修改后重新发布");
        notification.setMetadataJson("{\"violations\":[{\"field\":\"title\",\"reasonCode\":\"CONTENT_POLICY\"}]}");
        notification.setCreatedAt(Instant.parse("2026-08-09T00:00:00Z"));
        when(notificationMapper.selectOfficialPageByRecipientUserId(USER_ID, null, null, 16)).thenReturn(List.of(notification));
        when(assets.getByIds(USER_ID, List.of(21L))).thenReturn(Map.of());

        var response = service.list(USER_ID, null);

        assertThat(response.items()).singleElement().satisfies(item -> {
            assertThat(item.notificationId()).isEqualTo("11");
            assertThat(item.image()).isNull();
            assertThat(item.metadata())
                    .containsEntry("violations", List.of(Map.of("field", "title", "reasonCode", "CONTENT_POLICY")));
        });
    }

    @Test
    void listsOfficialNotificationWhenItsOptionalImagePreviewCannotBeResolved() {
        UserNotification notification = new UserNotification();
        notification.setId(12L);
        notification.setImageId(22L);
        notification.setEventType("PUBLICATION_APPROVED");
        notification.setTitle("图片发布成功");
        notification.setContent("你的图片已发布到灵感页。");
        notification.setCreatedAt(Instant.parse("2026-08-09T00:00:00Z"));
        when(notificationMapper.selectOfficialPageByRecipientUserId(USER_ID, null, null, 16)).thenReturn(List.of(notification));
        when(assets.getByIds(USER_ID, List.of(22L))).thenThrow(new IllegalStateException("OSS unavailable"));

        var response = service.list(USER_ID, null);

        assertThat(response.items()).singleElement().satisfies(item -> {
            assertThat(item.notificationId()).isEqualTo("12");
            assertThat(item.title()).isEqualTo("图片发布成功");
            assertThat(item.image()).isNull();
        });
    }

    @Test
    void returnsUnreadOfficialNotificationCount() {
        when(notificationMapper.countUnreadOfficialByRecipientUserId(USER_ID)).thenReturn(3L);

        assertThat(service.unreadCount(USER_ID).unreadCount()).isEqualTo(3L);
    }

    @Test
    void marksOwnedNotificationReadIdempotently() {
        when(notificationMapper.markOfficialRead(eq(11L), eq(USER_ID), any())).thenReturn(1);

        service.markRead(USER_ID, 11L);
        service.markRead(USER_ID, 11L);

        verify(notificationMapper, org.mockito.Mockito.times(2)).markOfficialRead(eq(11L), eq(USER_ID), any());
    }

    @Test
    void rejectsMessageOutsideCurrentUsersOfficialInbox() {
        when(notificationMapper.markOfficialRead(eq(11L), eq(USER_ID), any())).thenReturn(0);

        assertThatThrownBy(() -> service.markRead(USER_ID, 11L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void marksAllOfficialNotificationsRead() {
        service.markAllRead(USER_ID);

        verify(notificationMapper).markAllOfficialRead(eq(USER_ID), any());
    }

    @Test
    void deletesOfficialNotificationsIdempotently() {
        when(notificationMapper.softDeleteOfficial(eq(11L), eq(USER_ID), any())).thenReturn(1);
        service.delete(USER_ID, 11L);

        when(notificationMapper.softDeleteOfficial(eq(12L), eq(USER_ID), any())).thenReturn(0);
        service.delete(USER_ID, 12L);
    }

    @Test
    void batchDeletesOfficialNotifications() {
        service.deleteBatch(USER_ID, List.of("11", "12", "11"));

        verify(notificationMapper).softDeleteOfficials(eq(USER_ID), eq(List.of(11L, 12L)), any());
    }
}
