package com.superz.aivista.common.exception;

import org.springframework.http.HttpStatus;

/** 应用对外暴露的稳定错误码。 */
public enum ErrorCode {
    LIKE_RATE_LIMITED(42902, "点赞操作过于频繁，请稍后重试", HttpStatus.TOO_MANY_REQUESTS),
    FOLLOW_RATE_LIMITED(42903, "关注操作过于频繁，请稍后重试", HttpStatus.TOO_MANY_REQUESTS),
    SEARCH_RATE_LIMITED(42904, "搜索请求过于频繁，请稍后重试", HttpStatus.TOO_MANY_REQUESTS),
    SUCCESS(0, "ok", HttpStatus.OK),
    BAD_REQUEST(40000, "请求参数错误", HttpStatus.BAD_REQUEST),
    UNAUTHORIZED(40100, "未登录或登录已失效", HttpStatus.UNAUTHORIZED),
    LOGIN_FAILED(40101, "登录账号或密码错误", HttpStatus.UNAUTHORIZED),
    REFRESH_SESSION_INVALID(40102, "登录会话已失效，请重新登录", HttpStatus.UNAUTHORIZED),
    FORBIDDEN(40300, "无权限访问", HttpStatus.FORBIDDEN),
    MEDIA_FORBIDDEN(40301, "无权使用该媒体文件", HttpStatus.FORBIDDEN),
    NOT_FOUND(40400, "资源不存在", HttpStatus.NOT_FOUND),
    METHOD_NOT_ALLOWED(40500, "请求方法不被允许", HttpStatus.METHOD_NOT_ALLOWED),
    LOGIN_NAME_EXISTS(40901, "登录账号已存在", HttpStatus.CONFLICT),
    GENERATION_CONSENT_VERSION_OUTDATED(40902, "第三方数据处理规则已更新，请重新确认", HttpStatus.CONFLICT),
    GENERATION_CONSENT_REQUIRED(40903, "请先确认第三方数据处理规则", HttpStatus.CONFLICT),
    USER_GENERATION_CONCURRENCY_LIMIT(40905, "未完成的生成任务数量已达上限", HttpStatus.CONFLICT),
    IDEMPOTENCY_KEY_CONFLICT(40906, "幂等键与此前请求不一致", HttpStatus.CONFLICT),
    GENERATION_RESOURCE_NOT_FOUND(40401, "生成资源不存在", HttpStatus.NOT_FOUND),
    VALIDATION_ERROR(42200, "请求参数校验失败", HttpStatus.UNPROCESSABLE_CONTENT),
    INVALID_CURSOR(42201, "分页游标无效", HttpStatus.UNPROCESSABLE_CONTENT),
    RATE_LIMITED(42900, "请求过于频繁，请稍后重试", HttpStatus.TOO_MANY_REQUESTS),
    DAILY_GENERATION_QUOTA_EXCEEDED(42901, "今日生成图片额度已用尽", HttpStatus.TOO_MANY_REQUESTS),
    SYSTEM_ERROR(50000, "系统繁忙，请稍后重试", HttpStatus.INTERNAL_SERVER_ERROR),
    SEARCH_UNAVAILABLE(50301, "搜索服务暂不可用，请稍后重试", HttpStatus.SERVICE_UNAVAILABLE);

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
