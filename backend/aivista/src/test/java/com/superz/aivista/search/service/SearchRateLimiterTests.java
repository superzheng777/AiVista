package com.superz.aivista.search.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.superz.aivista.common.exception.RateLimitException;
import org.junit.jupiter.api.Test;

class SearchRateLimiterTests {
    @Test
    void allowsBurstOfTenThenReturnsRateLimit() {
        SearchRateLimiter limiter = new SearchRateLimiter();
        for (int index = 0; index < 10; index++) limiter.check("user:7");
        assertThatThrownBy(() -> limiter.check("user:7")).isInstanceOf(RateLimitException.class);
        limiter.check("user:8");
    }
}
