package com.superz.aivista.publication.service;

import com.superz.aivista.user.service.InteractionNotificationWriter;

import com.superz.aivista.common.transaction.TestTransactions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.publication.mapper.ImageAssetLikeMapper;
import com.superz.aivista.user.mapper.UserStatsMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class GenerationImageLikeServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-11T08:00:00Z");

    @Test
    void firstLikeCreatesRelationAndIncrementsBothCounters() {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        ImageAssetLikeMapper likes = mock(ImageAssetLikeMapper.class);
        UserStatsMapper users = mock(UserStatsMapper.class);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        when(images.selectByAssetIdForUpdate(42L)).thenReturn(publicImage());
        when(likes.insertIfAbsent(7L, 42L, 3L, NOW)).thenReturn(1);
        when(images.changeLikeCount(42L, 1)).thenReturn(1);
        when(users.changeReceivedLikeCount(8L, 1)).thenReturn(1);
        when(notifications.insertInteraction(org.mockito.ArgumentMatchers.any())).thenAnswer(invocation -> {
            invocation.getArgument(0, com.superz.aivista.user.entity.UserNotification.class).setId(9L);
            return 1;
        });

        service(images, likes, users, notifications).like(7L, 42L, 3L);

        verify(images).changeLikeCount(42L, 1);
        verify(users).changeReceivedLikeCount(8L, 1);
        verify(notifications).insertInteraction(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void repeatedLikeDoesNotChangeCounters() {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        ImageAssetLikeMapper likes = mock(ImageAssetLikeMapper.class);
        UserStatsMapper users = mock(UserStatsMapper.class);
        when(images.selectByAssetIdForUpdate(42L)).thenReturn(publicImage());

        service(images, likes, users).like(7L, 42L, 3L);

        verify(images, never()).changeLikeCount(42L, 1);
        verify(users, never()).changeReceivedLikeCount(8L, 1);
    }

    @Test
    void failedReceivedCountUpdateStopsBeforeNotificationAndOutbox() {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        ImageAssetLikeMapper likes = mock(ImageAssetLikeMapper.class);
        UserStatsMapper users = mock(UserStatsMapper.class);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        when(images.selectByAssetIdForUpdate(42L)).thenReturn(publicImage());
        when(likes.insertIfAbsent(7L, 42L, 3L, NOW)).thenReturn(1);
        when(images.changeLikeCount(42L, 1)).thenReturn(1);
        var service = new GenerationImageLikeService(images, likes, users, new InteractionNotificationWriter(notifications, outbox, Clock.fixed(NOW, ZoneOffset.UTC)), outbox,
                new LikeRateLimiter(), Clock.fixed(NOW, ZoneOffset.UTC), TestTransactions.immediate());

        assertThatThrownBy(() -> service.like(7L, 42L, 3L))
                .isInstanceOf(IllegalStateException.class);

        verify(notifications, never()).insertInteraction(org.mockito.ArgumentMatchers.any());
        verify(outbox, never()).insertSelective(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void unlikeRemovesRelationAndDecrementsBothCounters() {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        ImageAssetLikeMapper likes = mock(ImageAssetLikeMapper.class);
        UserStatsMapper users = mock(UserStatsMapper.class);
        when(images.selectByAssetIdForUpdate(42L)).thenReturn(publicImage());
        when(likes.deleteByUserAssetAndVersion(7L, 42L, 3L)).thenReturn(1);
        when(images.changeLikeCount(42L, -1)).thenReturn(1);
        when(users.changeReceivedLikeCount(8L, -1)).thenReturn(1);

        service(images, likes, users).unlike(7L, 42L, 3L);

        verify(images).changeLikeCount(42L, -1);
        verify(users).changeReceivedLikeCount(8L, -1);
    }

    @Test
    void rejectsWithdrawnOrStalePublicationVersionBeforeChangingRelation() {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        ImageAssetLikeMapper likes = mock(ImageAssetLikeMapper.class);
        UserStatsMapper users = mock(UserStatsMapper.class);
        ImageAsset image = publicImage();
        image.setPublicAt(null);
        when(images.selectByAssetIdForUpdate(42L)).thenReturn(image);

        assertThatThrownBy(() -> service(images, likes, users).like(7L, 42L, 3L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));
        verify(likes, never()).insertIfAbsent(7L, 42L, 3L, NOW);
    }

    private static GenerationImageLikeService service(ImageAssetMapper images, ImageAssetLikeMapper likes,
            UserStatsMapper users) {
        return service(images, likes, users, mock(UserNotificationMapper.class));
    }

    @Test
    void selfLikeDoesNotCreateInteractionNotification() {
        ImageAssetMapper images = mock(ImageAssetMapper.class);
        ImageAssetLikeMapper likes = mock(ImageAssetLikeMapper.class);
        UserStatsMapper users = mock(UserStatsMapper.class);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        ImageAsset image = publicImage();
        image.setUserId(7L);
        when(images.selectByAssetIdForUpdate(42L)).thenReturn(image);
        when(likes.insertIfAbsent(7L, 42L, 3L, NOW)).thenReturn(1);
        when(images.changeLikeCount(42L, 1)).thenReturn(1);
        when(users.changeReceivedLikeCount(7L, 1)).thenReturn(1);

        service(images, likes, users, notifications).like(7L, 42L, 3L);

        verify(notifications, never()).insertInteraction(org.mockito.ArgumentMatchers.any());
    }

    private static GenerationImageLikeService service(ImageAssetMapper images, ImageAssetLikeMapper likes,
            UserStatsMapper users, UserNotificationMapper notifications) {
        return new GenerationImageLikeService(images, likes, users, new InteractionNotificationWriter(notifications, mock(OutboxEventMapper.class), Clock.fixed(NOW, ZoneOffset.UTC)), mock(OutboxEventMapper.class), new LikeRateLimiter(),
                Clock.fixed(NOW, ZoneOffset.UTC), TestTransactions.immediate());
    }

    private static ImageAsset publicImage() {
        ImageAsset image = new ImageAsset();
        image.setId(42L);
        image.setUserId(8L);
        image.setPublicAt(NOW);
        image.setPublicationReviewStatus("APPROVED");
        image.setPublicationVersion(3L);
        return image;
    }
}
