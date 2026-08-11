package com.superz.aivista.user.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserFollowMapper;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserFollowService {
    private final UserMapper users;
    private final UserFollowMapper follows;
    private final UserNotificationMapper notifications;
    private final OutboxEventMapper outboxEvents;
    private final FollowRateLimiter rateLimiter;
    private final Clock clock;

    public UserFollowService(UserMapper users, UserFollowMapper follows, UserNotificationMapper notifications,
            OutboxEventMapper outboxEvents, FollowRateLimiter rateLimiter, Clock clock) {
        this.users = users;
        this.follows = follows;
        this.notifications = notifications;
        this.outboxEvents = outboxEvents;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
    }

    @Transactional
    public void follow(long followerUserId, long followingUserId) {
        change(followerUserId, followingUserId, true);
    }

    @Transactional
    public void unfollow(long followerUserId, long followingUserId) {
        change(followerUserId, followingUserId, false);
    }

    private void change(long followerUserId, long followingUserId, boolean following) {
        rateLimiter.check(followerUserId, followingUserId);
        if (followerUserId == followingUserId) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "不能关注自己");
        }
        if (users.selectIdsForUpdate(List.of(followerUserId, followingUserId)).size() != 2) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
        Instant now = clock.instant();
        int changed = following
                ? follows.insertIfAbsent(followerUserId, followingUserId, now)
                : follows.delete(followerUserId, followingUserId);
        if (changed == 0) return;
        int delta = following ? 1 : -1;
        if (users.changeFollowingCount(followerUserId, delta) != 1
                || users.changeFollowerCount(followingUserId, delta) != 1) {
            throw new IllegalStateException("Follow counters are inconsistent");
        }
        if (following) createFollowNotification(followerUserId, followingUserId, now);
    }

    private void createFollowNotification(long actorUserId, long recipientUserId, Instant now) {
        UserNotification notification = new UserNotification();
        notification.setRecipientUserId(recipientUserId);
        notification.setCategory("INTERACTION");
        notification.setEventType("USER_FOLLOWED");
        notification.setActorUserId(actorUserId);
        notification.setTitle("新的关注");
        notification.setContent("有人关注了你");
        notification.setMetadataJson("{\"actorUserId\":\"" + actorUserId + "\"}");
        notification.setCreatedAt(now);
        if (notifications.insertInteraction(notification) != 1 || notification.getId() == null) {
            throw new IllegalStateException("Cannot create follow notification");
        }
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.INTERACTION_NOTIFICATION_CREATED.name());
        event.setAggregateType("USER_NOTIFICATION");
        event.setAggregateId(notification.getId());
        event.setAggregateVersion(1L);
        event.setPayloadJson("{\"recipientUserId\":\"" + recipientUserId + "\",\"notificationId\":\""
                + notification.getId() + "\"}");
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        outboxEvents.insertSelective(event);
    }
}
