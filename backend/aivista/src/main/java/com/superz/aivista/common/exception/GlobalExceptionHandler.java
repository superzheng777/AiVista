package com.superz.aivista.common.exception;

import com.superz.aivista.common.response.ApiResponse;
import com.superz.aivista.common.response.ResponseUtils;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** 将控制器层异常转换为统一且不泄露内部细节的 HTTP 响应。 */
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException exception) {
        return response(exception.getErrorCode(), exception.getMessage());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    public ResponseEntity<ApiResponse<Void>> handleValidationException(Exception exception) {
        FieldError fieldError = exception instanceof MethodArgumentNotValidException methodException
                ? methodException.getBindingResult().getFieldError()
                : ((BindException) exception).getBindingResult().getFieldError();
        String message = fieldError == null ? ErrorCode.VALIDATION_ERROR.getMessage()
                : fieldError.getField() + "：" + fieldError.getDefaultMessage();
        return response(ErrorCode.VALIDATION_ERROR, message);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException exception) {
        String message = exception.getConstraintViolations().stream().findFirst()
                .map(violation -> violation.getPropertyPath() + "：" + violation.getMessage())
                .orElse(ErrorCode.VALIDATION_ERROR.getMessage());
        return response(ErrorCode.VALIDATION_ERROR, message);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(Exception exception) {
        return response(ErrorCode.BAD_REQUEST, ErrorCode.BAD_REQUEST.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpectedException(Exception exception) {
        log.error("Unhandled server exception", exception);
        return response(ErrorCode.SYSTEM_ERROR, ErrorCode.SYSTEM_ERROR.getMessage());
    }

    private ResponseEntity<ApiResponse<Void>> response(ErrorCode errorCode, String message) {
        return ResponseEntity.status(errorCode.getHttpStatus()).body(ResponseUtils.error(errorCode, message));
    }
}
