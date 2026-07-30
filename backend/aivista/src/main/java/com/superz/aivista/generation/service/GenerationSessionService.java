package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationSessionResponse;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 管理当前用户可修改的生成会话属性。 */
@Service
public class GenerationSessionService {
    private final GenerationSessionMapper sessionMapper;

    public GenerationSessionService(GenerationSessionMapper sessionMapper) {
        this.sessionMapper = sessionMapper;
    }

    /** 修改会话标题，不改变会话最后活动时间和侧栏排序。 */
    @Transactional
    public GenerationSessionResponse updateTitle(long userId, long sessionId, String title) {
        String normalizedTitle = requireValidTitle(title);
        if (sessionMapper.updateTitle(sessionId, userId, normalizedTitle) != 1) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        GenerationSession session = sessionMapper.selectOwnedById(sessionId, userId);
        if (session == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        return new GenerationSessionResponse(String.valueOf(session.getId()), session.getTitle(),
                session.getCreatedAt(), session.getLastMessageAt());
    }

    private static String requireValidTitle(String title) {
        String normalized = title == null ? null : title.strip();
        if (normalized == null || codePointLength(normalized) < 1 || codePointLength(normalized) > 100) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "title：必须为1到100个字符");
        }
        return normalized;
    }

    private static int codePointLength(String value) {
        return value.codePointCount(0, value.length());
    }
}
