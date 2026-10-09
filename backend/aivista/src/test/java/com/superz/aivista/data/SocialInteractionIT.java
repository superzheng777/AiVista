package com.superz.aivista.data;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.transaction.RetryingTransaction;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.publication.mapper.ImageAssetLikeMapper;
import com.superz.aivista.publication.service.GenerationImageLikeService;
import com.superz.aivista.publication.service.LikeRateLimiter;
import com.superz.aivista.publication.service.PublicationReviewOutcomeService;
import com.superz.aivista.publication.service.PublicationService;
import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.mapper.UserFollowMapper;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import com.superz.aivista.user.mapper.UserStatsMapper;
import com.superz.aivista.user.service.FollowRateLimiter;
import com.superz.aivista.user.service.InteractionNotificationWriter;
import com.superz.aivista.user.service.UserFollowService;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;

class SocialInteractionIT extends LocalMysqlIntegrationTest {
    @Autowired UserMapper users;
    @Autowired UserStatsMapper stats;
    @Autowired UserFollowMapper follows;
    @Autowired UserNotificationMapper notifications;
    @Autowired ImageAssetMapper images;
    @Autowired ImageAssetLikeMapper likes;
    @Autowired OutboxEventMapper outbox;
    @Autowired PlatformTransactionManager transactionManager;
    private RetryingTransaction transactions;
    private InteractionNotificationWriter writer;
    private UserFollowService followService;
    private GenerationImageLikeService likeService;
    private PublicationService publications;
    private PublicationReviewOutcomeService reviews;

    @BeforeEach
    void services() {
        Clock clock = Clock.systemUTC();
        transactions = new RetryingTransaction(transactionManager);
        writer = new InteractionNotificationWriter(notifications, outbox, clock);
        followService = new UserFollowService(users, stats, follows, writer, mock(FollowRateLimiter.class), clock, transactions);
        likeService = new GenerationImageLikeService(images, likes, stats, writer, outbox, mock(LikeRateLimiter.class), clock, transactions);
        publications = new PublicationService(images, stats, likes, outbox, clock, transactions);
        reviews = new PublicationReviewOutcomeService(images, outbox, notifications, clock, new ObjectMapper(), transactions);
    }

    @Test
    void refollowPreservesReadAndDeletedNotificationAndEmitsNoNewPush() {
        long a = user("alice"), b = user("bob");
        followService.follow(a, b);
        long notificationId = jdbcTemplate.queryForObject("SELECT id FROM user_notifications", Long.class);
        notifications.markInteractionRead(notificationId, b, Instant.now());
        notifications.softDeleteInteraction(notificationId, b, Instant.now());
        followService.unfollow(a, b);
        followService.follow(a, b);
        followService.follow(a, b);
        assertThat(count("user_follows")).isEqualTo(1);
        assertThat(count("user_notifications")).isEqualTo(1);
        assertThat(count("outbox_events")).isEqualTo(1);
        assertThat(notifications.selectOneById(notificationId).getReadAt()).isNotNull();
        assertThat(notifications.selectOneById(notificationId).getDeletedAt()).isNotNull();
        assertCounters();
    }

    @Test
    void likesNotifyOncePerPublicationCycleAndStillEmitSearchUpdates() {
        long actor = user("actor"), author = user("author"), image = published(author);
        likeService.like(actor, image, 1);
        long notificationId = jdbcTemplate.queryForObject("SELECT id FROM user_notifications WHERE category='INTERACTION'", Long.class);
        notifications.softDeleteInteraction(notificationId, author, Instant.now());
        likeService.unlike(actor, image, 1);
        likeService.like(actor, image, 1);
        likeService.like(actor, image, 1);
        assertThat(interactionCount()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM outbox_events WHERE event_type='PUBLICATION_SEARCH_INDEX_SYNC'", Long.class)).isEqualTo(4);
        publications.withdraw(author, image);
        assertThat(count("image_asset_likes")).isZero();
        assertThat(stats.selectOneById(author).getReceivedLikeCount()).isZero();
        publications.request(author, image, "second", "description");
        reviews.approve(images.selectByAssetId(image), 2);
        assertThat(images.selectByAssetId(image).getPublicationVersion()).isEqualTo(2);
        likeService.like(actor, image, 2);
        assertThat(interactionCount()).isEqualTo(2);
        assertThat(notifications.selectOneById(notificationId).getDeletedAt()).isNotNull();
        assertThatThrownBy(() -> likeService.like(actor, image, 1)).isInstanceOf(BusinessException.class);
        assertCounters();
    }

    @Test
    void selfLikeCountsButNeverNotifies() {
        long author = user("author"), image = published(author);
        likeService.like(author, image, 1);
        assertThat(interactionCount()).isZero();
        assertThat(stats.selectOneById(author).getReceivedLikeCount()).isEqualTo(1);
        assertCounters();
    }

    @Test
    void missingStatsRollsBackRelationAndPublicationCounter() {
        long actor = user("actor"), author = user("author"), image = published(author);
        jdbcTemplate.update("DELETE FROM user_stats WHERE user_id=?", author);
        long events = count("outbox_events");
        assertThatThrownBy(() -> likeService.like(actor, image, 1)).isInstanceOf(IllegalStateException.class);
        assertThat(count("image_asset_likes")).isZero();
        assertThat(images.selectByAssetId(image).getLikeCount()).isZero();
        assertThat(count("outbox_events")).isEqualTo(events);
        assertThatThrownBy(() -> followService.follow(actor, author)).isInstanceOf(IllegalStateException.class);
        assertThat(count("user_follows")).isZero();
        assertThat(stats.selectOneById(actor).getFollowingCount()).isZero();
    }

    @Test
    void notificationForeignKeyFailureIsNotSuppressedAndRollsBackCounters() {
        long author = user("author");
        assertThatThrownBy(() -> transactions.run(() -> {
            stats.changeFollowerCount(author, 1);
            writer.followed(999999, author);
        })).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(stats.selectOneById(author).getFollowerCount()).isZero();
        assertThat(count("user_notifications")).isZero();
        assertThat(count("outbox_events")).isZero();
    }

    @Test
    void concurrentNotificationCreationUsesUniqueKeyWithoutDuplicateOutbox() throws Exception {
        long actor = user("actor"), author = user("author");
        parallel(() -> transactions.run(() -> writer.followed(actor, author)),
                () -> transactions.run(() -> writer.followed(actor, author)));
        assertThat(count("user_notifications")).isEqualTo(1);
        assertThat(count("outbox_events")).isEqualTo(1);
    }

    @Test
    void reciprocalFollowsRemainConsistentUnderConcurrency() throws Exception {
        long a = user("alice"), b = user("bob");
        for (int i = 0; i < 30; i++) {
            parallel(() -> followService.follow(a, b), () -> followService.follow(b, a));
            assertCounters();
            parallel(() -> followService.unfollow(a, b), () -> followService.unfollow(b, a));
        }
        assertThat(count("user_notifications")).isEqualTo(2);
        assertThat(count("outbox_events")).isEqualTo(2);
        assertCounters();
    }

    @Test
    void reciprocalLikesAndDuplicateRequestsRemainConsistent() throws Exception {
        long a = user("alice"), b = user("bob"), imageA = published(a), imageB = published(b);
        for (int i = 0; i < 30; i++) {
            parallel(() -> likeService.like(a, imageB, 1), () -> likeService.like(b, imageA, 1));
            parallel(() -> likeService.like(a, imageB, 1), () -> likeService.like(a, imageB, 1));
            assertCounters();
            parallel(() -> likeService.unlike(a, imageB, 1), () -> likeService.unlike(b, imageA, 1));
        }
        assertThat(interactionCount()).isEqualTo(2);
        assertCounters();
    }

    @Test
    void likesRacingWithdrawalCannotLeaveStaleLikesOrCounts() throws Exception {
        long actor = user("actor"), author = user("author"), image = published(author);
        for (long version = 1; version <= 20; version++) {
            final long currentVersion = version;
            parallel(() -> {
                try { likeService.like(actor, image, currentVersion); }
                catch (BusinessException exception) {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
                }
            }, () -> publications.withdraw(author, image));
            assertThat(count("image_asset_likes")).isZero();
            assertCounters();
            if (version < 20) {
                publications.request(author, image, "next", "description");
                reviews.approve(images.selectByAssetId(image), version + 1);
            }
        }
    }

    @Test
    void reviewRacingWithdrawalCannotRepublishOrNotifyForStaleVersion() throws Exception {
        long author = user("author"), image = asset(author);
        for (long version = 1; version <= 20; version++) {
            publications.request(author, image, "title", "description");
            ImageAsset pending = images.selectByAssetId(image);
            final long currentVersion = version;
            parallel(() -> reviews.approve(pending, currentVersion), () -> publications.withdraw(author, image));
            ImageAsset withdrawn = images.selectByAssetId(image);
            assertThat(withdrawn.getPublicAt()).isNull();
            assertThat(withdrawn.getPublicationReviewStatus()).isEqualTo("NONE");
            long notificationCount = count("user_notifications");
            reviews.approve(pending, currentVersion);
            assertThat(count("user_notifications")).isEqualTo(notificationCount);
        }
    }

    @Test
    void deadlockVictimRetriesWholeTransactionWithoutDoubleCounting() throws Exception {
        long a = user("alice"), b = user("bob");
        CyclicBarrier barrier = new CyclicBarrier(2);
        AtomicInteger first = new AtomicInteger(), second = new AtomicInteger();
        parallel(() -> deadlockWork(a, b, first, barrier), () -> deadlockWork(b, a, second, barrier));
        assertThat(first.get() + second.get()).isEqualTo(3);
        assertThat(stats.selectOneById(a).getFollowerCount()).isEqualTo(2);
        assertThat(stats.selectOneById(b).getFollowerCount()).isEqualTo(2);
    }

    private void deadlockWork(long firstId, long secondId, AtomicInteger attempts, CyclicBarrier barrier) {
        transactions.run(() -> {
            int attempt = attempts.incrementAndGet();
            stats.changeFollowerCount(firstId, 1);
            if (attempt == 1) {
                try { barrier.await(10, TimeUnit.SECONDS); }
                catch (Exception exception) { throw new IllegalStateException(exception); }
            }
            stats.changeFollowerCount(secondId, 1);
        });
    }

    private long user(String name) {
        User user = new User();
        user.setLoginName(name);
        user.setNickname(name);
        user.setPasswordHash("test-only");
        transactions.run(() -> { users.insertSelective(user); stats.initialize(user.getId()); });
        return user.getId();
    }

    private long asset(long author) {
        ImageAsset image = new ImageAsset();
        image.setUserId(author);
        image.setOrigin("UPLOADED");
        image.setLifecycle("PERSISTENT");
        image.setObjectKey("test/asset");
        image.setOriginalObjectKey("test/asset/original.png");
        image.setContentType("image/png");
        image.setFileSize(1L);
        image.setWidth(1024);
        image.setHeight(1024);
        images.insertSelective(image);
        return image.getId();
    }

    private long published(long author) {
        long image = asset(author);
        publications.request(author, image, "title", "description");
        reviews.approve(images.selectByAssetId(image), 1);
        return image;
    }

    private long count(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
    }

    private long interactionCount() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM user_notifications WHERE category='INTERACTION'", Long.class);
    }

    private void assertCounters() {
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM user_stats s WHERE
                following_count <> (SELECT COUNT(*) FROM user_follows f WHERE f.follower_user_id=s.user_id)
                OR follower_count <> (SELECT COUNT(*) FROM user_follows f WHERE f.following_user_id=s.user_id)
                OR received_like_count <> (SELECT COUNT(*) FROM image_asset_likes l
                    JOIN image_assets a ON a.id=l.asset_id
                    JOIN image_publications p ON p.asset_id=a.id AND p.publication_version=l.publication_version
                    WHERE a.user_id=s.user_id AND p.public_at IS NOT NULL AND p.review_status='APPROVED')
                """, Long.class)).isZero();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM image_publications p WHERE like_count <>
                (SELECT COUNT(*) FROM image_asset_likes l WHERE l.asset_id=p.asset_id AND l.publication_version=p.publication_version)
                """, Long.class)).isZero();
    }

    private static void parallel(Runnable one, Runnable two) throws Exception {
        try (var executor = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            var first = executor.submit(() -> { await(start); one.run(); });
            var second = executor.submit(() -> { await(start); two.run(); });
            start.countDown();
            first.get(20, TimeUnit.SECONDS);
            second.get(20, TimeUnit.SECONDS);
        }
    }

    private static void await(CountDownLatch start) {
        try { start.await(); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); }
    }
}
