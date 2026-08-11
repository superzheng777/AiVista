package com.superz.aivista.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserFollowMapper;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import com.superz.aivista.user.service.FollowRateLimiter;
import com.superz.aivista.user.service.UserFollowService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class UserFollowServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-11T12:00:00Z");

    @Test
    void firstFollowUpdatesCountersAndCreatesNotificationAndOutboxEvent() {
        UserMapper users = users();
        UserFollowMapper follows = mock(UserFollowMapper.class);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);
        when(follows.insertIfAbsent(1L, 2L, NOW)).thenReturn(1);
        when(users.changeFollowingCount(1L, 1)).thenReturn(1);
        when(users.changeFollowerCount(2L, 1)).thenReturn(1);
        when(notifications.insertInteraction(any())).thenAnswer(invocation -> {
            invocation.getArgument(0, UserNotification.class).setId(9L);
            return 1;
        });

        service(users, follows, notifications).follow(1L, 2L);

        verify(users).changeFollowingCount(1L, 1);
        verify(users).changeFollowerCount(2L, 1);
        verify(notifications).insertInteraction(any());
    }

    @Test
    void repeatedFollowDoesNotChangeCountersOrCreateAnotherNotification() {
        UserMapper users = users();
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);

        service(users, mock(UserFollowMapper.class), notifications).follow(1L, 2L);

        verify(users, never()).changeFollowingCount(1L, 1);
        verify(notifications, never()).insertInteraction(any());
    }

    @Test
    void unfollowIsSilentAndOnlyChangesCountersWhenRelationExisted() {
        UserMapper users = users();
        UserFollowMapper follows = mock(UserFollowMapper.class);
        when(follows.delete(1L, 2L)).thenReturn(1);
        when(users.changeFollowingCount(1L, -1)).thenReturn(1);
        when(users.changeFollowerCount(2L, -1)).thenReturn(1);
        UserNotificationMapper notifications = mock(UserNotificationMapper.class);

        service(users, follows, notifications).unfollow(1L, 2L);

        verify(notifications, never()).insertInteraction(any());
        verify(users).changeFollowingCount(1L, -1);
    }

    @Test
    void rejectsFollowingSelfBeforeReadingOrWritingRelations() {
        UserMapper users = mock(UserMapper.class);

        assertThatThrownBy(() -> service(users, mock(UserFollowMapper.class), mock(UserNotificationMapper.class)).follow(1L, 1L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        verify(users, never()).selectIdsForUpdate(any());
    }

    private static UserMapper users() {
        UserMapper users = mock(UserMapper.class);
        when(users.selectIdsForUpdate(List.of(1L, 2L))).thenReturn(List.of(1L, 2L));
        return users;
    }

    private static UserFollowService service(UserMapper users, UserFollowMapper follows,
            UserNotificationMapper notifications) {
        return new UserFollowService(users, follows, notifications, mock(OutboxEventMapper.class),
                new FollowRateLimiter(), Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
