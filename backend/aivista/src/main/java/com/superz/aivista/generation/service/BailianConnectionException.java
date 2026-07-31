package com.superz.aivista.generation.service;

/** 确认 HTTP 请求尚未发出时的百炼建连失败。 */
public class BailianConnectionException extends RuntimeException {
    public BailianConnectionException(Throwable cause) {
        super(cause);
    }
}
