package com.superz.aivista.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.superz.aivista.common.exception.RateLimitException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class FollowRateLimiterTests {
    private final AtomicLong now = new AtomicLong();
    private final FollowRateLimiter limiter = new FollowRateLimiter(now::get);

    @Test
    void preservesPairLimitAndReopensAtWindowBoundary() {
        for (int i = 0; i < 4; i++) limiter.check(1, 2);
        assertThatThrownBy(() -> limiter.check(1, 2))
                .isInstanceOfSatisfying(RateLimitException.class,
                        error -> assertThat(error.getRetryAfterSeconds()).isEqualTo(60));
        now.set(Duration.ofSeconds(59).toNanos());
        assertThatThrownBy(() -> limiter.check(1, 2))
                .isInstanceOfSatisfying(RateLimitException.class,
                        error -> assertThat(error.getRetryAfterSeconds()).isEqualTo(1));
        now.set(Duration.ofMinutes(1).toNanos());
        limiter.check(1, 2);
    }

    @Test
    void preservesUserLimitAcrossDifferentTargets() {
        for (int i = 2; i < 22; i++) limiter.check(1, i);
        assertThatThrownBy(() -> limiter.check(1, 22)).isInstanceOf(RateLimitException.class);
        limiter.check(2, 22);
    }

    @Test
    void removesIdleBucketsWithoutRevisitingTheirKeys() {
        limiter.check(1, 2);
        now.set(Duration.ofSeconds(30).toNanos());
        for (int i = 0; i < 4; i++) limiter.check(3, 4);
        now.set(Duration.ofMinutes(1).toNanos());
        limiter.check(5, 6);

        assertThat(buckets()).hasSize(4).doesNotContainKeys("user:1", "target:1:2");
        assertThatThrownBy(() -> limiter.check(3, 4)).isInstanceOf(RateLimitException.class);
    }

    @Test
    void boundsLiveBucketsAndKeepsRecentlyUsedLimitsDuringChurn() {
        for (int i = 0; i < 4; i++) limiter.check(1, 2);
        for (long user = 2; user <= 10_001; user++) {
            limiter.check(user, 20_000);
            if (user % 1000 == 0) {
                assertThatThrownBy(() -> limiter.check(1, 2)).isInstanceOf(RateLimitException.class);
            }
        }

        assertThat(buckets()).hasSize(20_000).containsKeys("user:1", "target:1:2");
        assertThatThrownBy(() -> limiter.check(1, 2)).isInstanceOf(RateLimitException.class);
        for (int i = 0; i < 3; i++) limiter.check(10_001, 20_000);
        assertThatThrownBy(() -> limiter.check(10_001, 20_000)).isInstanceOf(RateLimitException.class);
    }

    @SuppressWarnings("unchecked")
    private Map<String, ?> buckets() {
        return (Map<String, ?>) ReflectionTestUtils.getField(limiter, "timestampsByKey");
    }
}
