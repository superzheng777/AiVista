package com.superz.aivista.common.exception;

public class RateLimitException extends BusinessException {
    private final long retryAfterSeconds;

    public RateLimitException(ErrorCode errorCode, long retryAfterSeconds) {
        super(errorCode);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
