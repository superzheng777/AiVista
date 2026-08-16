package com.superz.aivista.search.service;

import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.exception.RateLimitException;
import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class SearchRateLimiter {
    private static final int CAPACITY = 10;
    private static final int MAX_BUCKETS = 20_000;
    private static final long REFILL_NANOS = Duration.ofSeconds(1).toNanos();
    private static final long IDLE_NANOS = Duration.ofHours(1).toNanos();
    private final Map<String, Bucket> buckets = new LinkedHashMap<>();

    public synchronized void check(String key) {
        long now = System.nanoTime();
        Bucket bucket = buckets.computeIfAbsent(key, ignored -> new Bucket(now));
        bucket.refill(now);
        if (bucket.tokens == 0) {
            long retryAfter = Math.max(1, (bucket.lastRefillNanos + REFILL_NANOS - now + 999_999_999L)
                    / 1_000_000_000L);
            throw new RateLimitException(ErrorCode.SEARCH_RATE_LIMITED, retryAfter);
        }
        bucket.tokens--;
        trim(now);
    }

    private void trim(long now) {
        if (buckets.size() <= MAX_BUCKETS) return;
        buckets.entrySet().removeIf(entry -> entry.getValue().lastAccessNanos < now - IDLE_NANOS);
        Iterator<String> iterator = buckets.keySet().iterator();
        while (buckets.size() > MAX_BUCKETS && iterator.hasNext()) {
            iterator.next();
            iterator.remove();
        }
    }

    private static final class Bucket {
        private int tokens = CAPACITY;
        private long lastRefillNanos;
        private long lastAccessNanos;

        private Bucket(long now) {
            lastRefillNanos = now;
            lastAccessNanos = now;
        }

        private void refill(long now) {
            long tokensToAdd = (now - lastRefillNanos) / REFILL_NANOS;
            if (tokensToAdd > 0) {
                tokens = (int) Math.min(CAPACITY, tokens + tokensToAdd);
                lastRefillNanos += tokensToAdd * REFILL_NANOS;
            }
            lastAccessNanos = now;
        }
    }
}
