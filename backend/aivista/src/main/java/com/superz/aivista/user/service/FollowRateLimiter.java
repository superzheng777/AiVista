package com.superz.aivista.user.service;

import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.exception.RateLimitException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import org.springframework.stereotype.Service;

@Service
public class FollowRateLimiter {
    private static final long WINDOW_NANOS = Duration.ofMinutes(1).toNanos();
    private static final int MAX_BUCKETS = 20_000;
    private final Map<String, Bucket> timestampsByKey = new LinkedHashMap<>(16, 0.75f, true);
    private final LongSupplier ticker;

    public FollowRateLimiter() {
        this(System::nanoTime);
    }

    FollowRateLimiter(LongSupplier ticker) {
        this.ticker = ticker;
    }

    public synchronized void check(long userId, long targetUserId) {
        long now = ticker.getAsLong();
        ArrayDeque<Long> target = bucket("target:" + userId + ':' + targetUserId, now);
        ArrayDeque<Long> user = bucket("user:" + userId, now);
        trim(now);
        long retryAfter = Math.max(retryAfter(target, 4, now), retryAfter(user, 20, now));
        if (retryAfter > 0) {
            throw new RateLimitException(ErrorCode.FOLLOW_RATE_LIMITED, retryAfter);
        }
        target.addLast(now);
        user.addLast(now);
    }

    private ArrayDeque<Long> bucket(String key, long now) {
        Bucket bucket = timestampsByKey.computeIfAbsent(key, ignored -> new Bucket());
        bucket.lastAccessNanos = now;
        expire(bucket.timestamps, now);
        return bucket.timestamps;
    }

    private void trim(long now) {
        // Access order lets us stop at the first live bucket once capacity is satisfied.
        Iterator<Bucket> iterator = timestampsByKey.values().iterator();
        while (iterator.hasNext()) {
            Bucket bucket = iterator.next();
            if (timestampsByKey.size() <= MAX_BUCKETS && now - bucket.lastAccessNanos < WINDOW_NANOS) break;
            iterator.remove();
        }
    }

    private static final class Bucket {
        private final ArrayDeque<Long> timestamps = new ArrayDeque<>();
        private long lastAccessNanos;
    }

    private static long retryAfter(ArrayDeque<Long> bucket, int limit, long now) {
        if (bucket.size() < limit) return 0;
        return Math.max(1, (bucket.peekFirst() + WINDOW_NANOS - now + 999_999_999L) / 1_000_000_000L);
    }

    private static void expire(ArrayDeque<Long> bucket, long now) {
        while (!bucket.isEmpty() && bucket.peekFirst() <= now - WINDOW_NANOS) bucket.removeFirst();
    }
}
