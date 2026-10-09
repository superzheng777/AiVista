package com.superz.aivista.user.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.transaction.RetryingTransaction;
import com.superz.aivista.user.mapper.UserFollowMapper;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserStatsMapper;
import java.time.Clock;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class UserFollowService {
    private final UserMapper users;
    private final UserStatsMapper stats;
    private final UserFollowMapper follows;
    private final InteractionNotificationWriter notifications;
    private final FollowRateLimiter rateLimiter;
    private final Clock clock;
    private final RetryingTransaction transactions;

    public UserFollowService(UserMapper users, UserStatsMapper stats, UserFollowMapper follows,
            InteractionNotificationWriter notifications, FollowRateLimiter rateLimiter, Clock clock,
            RetryingTransaction transactions) {
        this.users = users;
        this.stats = stats;
        this.follows = follows;
        this.notifications = notifications;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
        this.transactions = transactions;
    }

    public void follow(long followerUserId, long followingUserId) {
        change(followerUserId, followingUserId, true);
    }

    public void unfollow(long followerUserId, long followingUserId) {
        change(followerUserId, followingUserId, false);
    }

    private void change(long followerUserId, long followingUserId, boolean following) {
        rateLimiter.check(followerUserId, followingUserId);
        if (followerUserId == followingUserId) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "不能关注自己");
        }
        transactions.run(() -> {
            if (users.selectExistingIds(List.of(followerUserId, followingUserId)).size() != 2) {
                throw new BusinessException(ErrorCode.NOT_FOUND);
            }
            int changed = following
                    ? follows.insertIfAbsent(followerUserId, followingUserId, clock.instant())
                    : follows.delete(followerUserId, followingUserId);
            if (changed == 0) return;
            int delta = following ? 1 : -1;
            // UPDATE acquires the row lock; both directions always visit the smaller user ID first.
            if (followerUserId < followingUserId) {
                requireUpdated(stats.changeFollowingCount(followerUserId, delta));
                requireUpdated(stats.changeFollowerCount(followingUserId, delta));
            } else {
                requireUpdated(stats.changeFollowerCount(followingUserId, delta));
                requireUpdated(stats.changeFollowingCount(followerUserId, delta));
            }
            if (following) notifications.followed(followerUserId, followingUserId);
        });
    }

    private static void requireUpdated(int changed) {
        if (changed != 1) throw new IllegalStateException("Follow counters are inconsistent");
    }
}
