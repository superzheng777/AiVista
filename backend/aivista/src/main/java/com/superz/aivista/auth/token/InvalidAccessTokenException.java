package com.superz.aivista.auth.token;

/** 表示 Access Token 无法作为有效认证凭证使用。 */
public class InvalidAccessTokenException extends RuntimeException {
    public InvalidAccessTokenException(String message) {
        super(message);
    }

    public InvalidAccessTokenException(String message, Throwable cause) {
        super(message, cause);
    }
}
