package com.superz.aivista.common.exception;

import org.springframework.http.HttpStatus;

/** 应用对外暴露的稳定错误码。 */
public enum ErrorCode {
    SUCCESS(0, "ok", HttpStatus.OK),
    BAD_REQUEST(40000, "请求参数错误", HttpStatus.BAD_REQUEST),
    UNAUTHORIZED(40100, "未登录或登录已失效", HttpStatus.UNAUTHORIZED),
    LOGIN_FAILED(40101, "登录账号或密码错误", HttpStatus.UNAUTHORIZED),
    REFRESH_SESSION_INVALID(40102, "登录会话已失效，请重新登录", HttpStatus.UNAUTHORIZED),
    FORBIDDEN(40300, "无权限访问", HttpStatus.FORBIDDEN),
    MEDIA_FORBIDDEN(40301, "无权使用该媒体文件", HttpStatus.FORBIDDEN),
    NOT_FOUND(40400, "资源不存在", HttpStatus.NOT_FOUND),
    LOGIN_NAME_EXISTS(40901, "登录账号已存在", HttpStatus.CONFLICT),
    VALIDATION_ERROR(42200, "请求参数校验失败", HttpStatus.UNPROCESSABLE_CONTENT),
    RATE_LIMITED(42900, "请求过于频繁，请稍后重试", HttpStatus.TOO_MANY_REQUESTS),
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
