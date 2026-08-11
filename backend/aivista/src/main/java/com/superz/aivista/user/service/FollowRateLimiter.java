package com.superz.aivista.user.service;

import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.exception.RateLimitException;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class FollowRateLimiter {
    private static final long WINDOW_NANOS = Duration.ofMinutes(1).toNanos();
    private static final int MAX_BUCKETS = 20_000;
    private final Map<String, ArrayDeque<Long>> timestampsByKey = new LinkedHashMap<>();

    public synchronized void check(long userId, long targetUserId) {
        long now = System.nanoTime();
        ArrayDeque<Long> target = bucket("target:" + userId + ':' + targetUserId, now);
        ArrayDeque<Long> user = bucket("user:" + userId, now);
        long retryAfter = Math.max(retryAfter(target, 4, now), retryAfter(user, 20, now));
        if (retryAfter > 0) {
            throw new RateLimitException(ErrorCode.FOLLOW_RATE_LIMITED, retryAfter);
        }
        target.addLast(now);
        user.addLast(now);
    }

    private ArrayDeque<Long> bucket(String key, long now) {
        ArrayDeque<Long> bucket = timestampsByKey.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        expire(bucket, now);
        if (timestampsByKey.size() > MAX_BUCKETS) {
            Iterator<Map.Entry<String, ArrayDeque<Long>>> iterator = timestampsByKey.entrySet().iterator();
            while (timestampsByKey.size() > MAX_BUCKETS && iterator.hasNext()) {
                if (iterator.next().getValue().isEmpty()) {
                    iterator.remove();
                }
            }
        }
        return bucket;
    }

    private static long retryAfter(ArrayDeque<Long> bucket, int limit, long now) {
        if (bucket.size() < limit) return 0;
        return Math.max(1, (bucket.peekFirst() + WINDOW_NANOS - now + 999_999_999L) / 1_000_000_000L);
    }

    private static void expire(ArrayDeque<Long> bucket, long now) {
        while (!bucket.isEmpty() && bucket.peekFirst() <= now - WINDOW_NANOS) bucket.removeFirst();
    }
}
