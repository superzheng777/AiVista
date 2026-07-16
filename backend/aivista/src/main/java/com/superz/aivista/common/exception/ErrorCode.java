package com.superz.aivista.common.exception;

import org.springframework.http.HttpStatus;

/** 应用对外暴露的稳定错误码。 */
public enum ErrorCode {
    SUCCESS(0, "ok", HttpStatus.OK),
    BAD_REQUEST(40000, "请求参数错误", HttpStatus.BAD_REQUEST),
    UNAUTHORIZED(40100, "未登录或登录已失效", HttpStatus.UNAUTHORIZED),
    FORBIDDEN(40300, "无权限访问", HttpStatus.FORBIDDEN),
    NOT_FOUND(40400, "资源不存在", HttpStatus.NOT_FOUND),
    VALIDATION_ERROR(42200, "请求参数校验失败", HttpStatus.UNPROCESSABLE_CONTENT),
    SYSTEM_ERROR(50000, "系统繁忙，请稍后重试", HttpStatus.INTERNAL_SERVER_ERROR);

    private final int code;
    private final String message;
    private final HttpStatus httpStatus;

    ErrorCode(int code, String message, HttpStatus httpStatus) {
        this.code = code;
        this.message = message;
        this.httpStatus = httpStatus;
    }

    public int getCode() { return code; }
    public String getMessage() { return message; }
    public HttpStatus getHttpStatus() { return httpStatus; }
}
