package com.superz.aivista.publication.service;

import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.exception.RateLimitException;
import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class LikeRateLimiter {
    private static final int MAX_BUCKETS = 20_000;
    private static final BucketRule IMAGE_RULE = new BucketRule(4, Duration.ofSeconds(3));
    private static final BucketRule USER_RULE = new BucketRule(10, Duration.ofSeconds(1));

    private final Map<String, Bucket> buckets = new LinkedHashMap<>();

    public synchronized void check(long userId, long imageId) {
        long now = System.nanoTime();
        Bucket imageBucket = bucket("image:" + userId + ':' + imageId, IMAGE_RULE, now);
        Bucket userBucket = bucket("user:" + userId, USER_RULE, now);
        long retryAfterNanos = Math.max(imageBucket.retryAfterNanos(now), userBucket.retryAfterNanos(now));
        if (retryAfterNanos > 0) {
            throw new RateLimitException(ErrorCode.LIKE_RATE_LIMITED,
                    Math.max(1, (retryAfterNanos + 999_999_999L) / 1_000_000_000L));
        }
        imageBucket.consume();
        userBucket.consume();
    }

    private Bucket bucket(String key, BucketRule rule, long now) {
        Bucket bucket = buckets.computeIfAbsent(key, ignored -> new Bucket(rule, now));
        bucket.refill(now);
        if (buckets.size() > MAX_BUCKETS) {
            buckets.entrySet().removeIf(entry -> entry.getValue().lastAccessNanos < now - Duration.ofHours(1).toNanos());
            Iterator<String> keys = buckets.keySet().iterator();
            while (buckets.size() > MAX_BUCKETS && keys.hasNext()) {
                keys.next();
                keys.remove();
            }
        }
        return bucket;
    }

    private record BucketRule(int capacity, Duration refillInterval) {
    }

    private static final class Bucket {
        private final BucketRule rule;
        private int tokens;
        private long lastRefillNanos;
        private long lastAccessNanos;

        private Bucket(BucketRule rule, long now) {
            this.rule = rule;
            this.tokens = rule.capacity();
            this.lastRefillNanos = now;
            this.lastAccessNanos = now;
        }

        private void refill(long now) {
            long intervals = (now - lastRefillNanos) / rule.refillInterval().toNanos();
            if (intervals > 0) {
                tokens = Math.min(rule.capacity(), Math.toIntExact(tokens + intervals));
                lastRefillNanos += intervals * rule.refillInterval().toNanos();
            }
            lastAccessNanos = now;
        }

        private long retryAfterNanos(long now) {
            return tokens > 0 ? 0 : rule.refillInterval().toNanos() - (now - lastRefillNanos);
        }

        private void consume() {
            tokens--;
        }
    }
}
