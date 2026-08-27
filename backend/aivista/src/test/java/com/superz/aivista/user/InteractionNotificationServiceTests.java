package com.superz.aivista.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.publication.service.InspirationQueryService;
import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import com.superz.aivista.user.service.InteractionNotificationService;
import java.time.Instant;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class InteractionNotificationServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-11T12:00:00Z");

    @Test
    void returnsFixedSizePageAndCursorFromLastReturnedNotification() {
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        UserMapper users = mock(UserMapper.class);
        when(notifications.selectInteractionPageByRecipientUserId(1L, null, null, 16))
                .thenReturn(notifications(16));
        when(users.selectPublicByIds(anyList())).thenReturn(List.of(actor()));

        var response = service(notifications, users, mock(ImageAssetMapper.class), mock(InspirationQueryService.class))
                .list(1L, null);

        assertThat(response.items()).hasSize(15);
        assertThat(response.items().getLast().notificationId()).isEqualTo("15");
        assertThat(response.nextCursor()).isNotNull();
        verify(notifications).selectInteractionPageByRecipientUserId(1L, null, null, 16);
    }

    @Test
    void returnsImageOnlyWhenCurrentPublicationVersionMatchesNotification() {
        UserNotification notification = notification(1L);
        notification.setImageId(9L);
        notification.setPublicationVersion(2L);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        UserMapper users = mock(UserMapper.class);
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        InspirationQueryService inspirations = mock(InspirationQueryService.class);
        when(notifications.selectInteractionPageByRecipientUserId(1L, null, null, 16)).thenReturn(List.of(notification));
        when(users.selectPublicByIds(List.of(2L))).thenReturn(List.of(actor()));
        ImageAsset image = new ImageAsset();
        image.setId(9L);
        when(images.selectPublishedByIds(List.of(9L))).thenReturn(List.of(image));
        when(inspirations.toPublicImages(anyList(), anyLong())).thenReturn(List.of(imageResponse(9L, 3L)));

        var response = service(notifications, users, images, inspirations).list(1L, null);

        assertThat(response.items().getFirst().image()).isNull();
    }

    @Test
    void rejectsMalformedCursorBeforeQueryingNotifications() {
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);

        assertThatThrownBy(() -> service(notifications, mock(UserMapper.class), mock(ImageAssetMapper.class),
                mock(InspirationQueryService.class)).list(1L, "not-a-cursor"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_CURSOR));
        verify(notifications, org.mockito.Mockito.never())
                .selectInteractionPageByRecipientUserId(anyLong(), isNull(), isNull(), anyInt());
    }

    private static InteractionNotificationService service(UserNotificationMapper notifications, UserMapper users,
            ImageAssetMapper images, InspirationQueryService inspirations) {
        return new InteractionNotificationService(notifications, users, images, inspirations,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static List<UserNotification> notifications(int count) {
        List<UserNotification> notifications = new ArrayList<>();
        for (long id = 1; id <= count; id++) notifications.add(notification(id));
        return notifications;
    }

    private static UserNotification notification(long id) {
        UserNotification notification = new UserNotification();
        notification.setId(id);
        notification.setActorUserId(2L);
        notification.setEventType("USER_FOLLOWED");
        notification.setCreatedAt(NOW.minusSeconds(id));
        return notification;
    }

    private static User actor() {
        User user = new User();
        user.setId(2L);
        user.setNickname("Alice");
        return user;
    }

    private static GenerationAssetImageResponse imageResponse(long imageId, long publicationVersion) {
        return new GenerationAssetImageResponse(String.valueOf(imageId), 0, new GenerationAssetImageResponse.ImageUrls(
                new GenerationAssetImageResponse.ImageUrl("https://example.com/image", NOW), null), NOW,
                false, "prompt", "negative", new GenerationAssetImageResponse.GenerationConfig(1, 1, 1, false),
                "APPROVED", publicationVersion, NOW, "title", "description", "2", 0, false);
    }
}
