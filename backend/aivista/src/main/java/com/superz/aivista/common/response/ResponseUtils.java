package com.superz.aivista.common.response;

import com.superz.aivista.common.exception.ErrorCode;

/** 创建统一响应对象的便捷方法。 */
public final class ResponseUtils {
    private ResponseUtils() { }

    public static <T> ApiResponse<T> success(T data) { return ApiResponse.success(data); }
    public static ApiResponse<Void> error(ErrorCode errorCode) { return error(errorCode, errorCode.getMessage()); }
    public static ApiResponse<Void> error(ErrorCode errorCode, String message) {
        return ApiResponse.error(errorCode.getCode(), message);
    }
}
