package com.superz.aivista.common.request;

/** 业务请求 DTO 的可选基类，用于承载跨接口通用字段。 */
public class BaseRequest {
    /** 调用方传入的请求追踪标识，可用于日志关联与问题排查。 */
    private String requestId;

    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
}
