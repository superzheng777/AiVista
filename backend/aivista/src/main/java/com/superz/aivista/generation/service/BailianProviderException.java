package com.superz.aivista.generation.service;

/** 仅在服务端流转的百炼失败信息，调用方据此映射稳定任务失败码。 */
public class BailianProviderException extends RuntimeException {
    private final int httpStatus;
    private final String providerCode;
    private final String requestId;

    public BailianProviderException(int httpStatus, String providerCode, String requestId, String message) {
        super(message);
        this.httpStatus = httpStatus;
        this.providerCode = providerCode;
        this.requestId = requestId;
    }

    public int httpStatus() { return httpStatus; }

    public String providerCode() { return providerCode; }

    public String requestId() { return requestId; }
}
