package com.superz.aivista.publication.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.publication.mapper.GenerationImageLikeMapper;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class GenerationImageLikeServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-11T08:00:00Z");

    @Test
    void firstLikeCreatesRelationAndIncrementsBothCounters() {
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        GenerationImageLikeMapper likes = mock(GenerationImageLikeMapper.class);
        UserMapper users = mock(UserMapper.class);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        when(images.selectByImageIdForUpdate(42L)).thenReturn(publicImage());
        when(likes.insertIfAbsent(7L, 42L, 3L, NOW)).thenReturn(1);
        when(users.selectIdForUpdate(8L)).thenReturn(8L);
        when(images.changeLikeCount(42L, 1)).thenReturn(1);
        when(users.changeReceivedLikeCount(8L, 1)).thenReturn(1);
        when(notifications.insertImageLikeInteractionIfAbsent(org.mockito.ArgumentMatchers.any())).thenAnswer(invocation -> {
            invocation.getArgument(0, com.superz.aivista.user.entity.UserNotification.class).setId(9L);
            return 1;
        });

        service(images, likes, users, notifications).like(7L, 42L, 3L);

        verify(images).changeLikeCount(42L, 1);
        verify(users).changeReceivedLikeCount(8L, 1);
        verify(notifications).insertImageLikeInteractionIfAbsent(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void repeatedLikeDoesNotChangeCounters() {
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        GenerationImageLikeMapper likes = mock(GenerationImageLikeMapper.class);
        UserMapper users = mock(UserMapper.class);
        when(images.selectByImageIdForUpdate(42L)).thenReturn(publicImage());

        service(images, likes, users).like(7L, 42L, 3L);

        verify(images, never()).changeLikeCount(42L, 1);
        verify(users, never()).changeReceivedLikeCount(8L, 1);
    }

    @Test
    void unlikeRemovesRelationAndDecrementsBothCounters() {
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        GenerationImageLikeMapper likes = mock(GenerationImageLikeMapper.class);
        UserMapper users = mock(UserMapper.class);
        when(images.selectByImageIdForUpdate(42L)).thenReturn(publicImage());
        when(likes.deleteByUserImageAndVersion(7L, 42L, 3L)).thenReturn(1);
        when(users.selectIdForUpdate(8L)).thenReturn(8L);
        when(images.changeLikeCount(42L, -1)).thenReturn(1);
        when(users.changeReceivedLikeCount(8L, -1)).thenReturn(1);

        service(images, likes, users).unlike(7L, 42L, 3L);

        verify(images).changeLikeCount(42L, -1);
        verify(users).changeReceivedLikeCount(8L, -1);
    }

    @Test
    void rejectsWithdrawnOrStalePublicationVersionBeforeChangingRelation() {
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        GenerationImageLikeMapper likes = mock(GenerationImageLikeMapper.class);
        UserMapper users = mock(UserMapper.class);
        GenerationImage image = publicImage();
        image.setPublicAt(null);
        when(images.selectByImageIdForUpdate(42L)).thenReturn(image);

        assertThatThrownBy(() -> service(images, likes, users).like(7L, 42L, 3L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));
        verify(likes, never()).insertIfAbsent(7L, 42L, 3L, NOW);
    }

    private static GenerationImageLikeService service(GenerationImageMapper images, GenerationImageLikeMapper likes,
            UserMapper users) {
        return service(images, likes, users, mock(UserNotificationMapper.class));
    }

    @Test
    void selfLikeDoesNotCreateInteractionNotification() {
        GenerationImageMapper images = mock(GenerationImageMapper.class);
        GenerationImageLikeMapper likes = mock(GenerationImageLikeMapper.class);
        UserMapper users = mock(UserMapper.class);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        GenerationImage image = publicImage();
        image.setUserId(7L);
        when(images.selectByImageIdForUpdate(42L)).thenReturn(image);
        when(likes.insertIfAbsent(7L, 42L, 3L, NOW)).thenReturn(1);
        when(users.selectIdForUpdate(7L)).thenReturn(7L);
        when(images.changeLikeCount(42L, 1)).thenReturn(1);
        when(users.changeReceivedLikeCount(7L, 1)).thenReturn(1);

        service(images, likes, users, notifications).like(7L, 42L, 3L);

        verify(notifications, never()).insertImageLikeInteractionIfAbsent(org.mockito.ArgumentMatchers.any());
    }

    private static GenerationImageLikeService service(GenerationImageMapper images, GenerationImageLikeMapper likes,
            UserMapper users, UserNotificationMapper notifications) {
        return new GenerationImageLikeService(images, likes, users, notifications, mock(OutboxEventMapper.class), new LikeRateLimiter(),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static GenerationImage publicImage() {
        GenerationImage image = new GenerationImage();
        image.setId(42L);
        image.setUserId(8L);
        image.setPublicAt(NOW);
        image.setPublicationReviewStatus("APPROVED");
        image.setPublicationVersion(3L);
        return image;
    }
}
