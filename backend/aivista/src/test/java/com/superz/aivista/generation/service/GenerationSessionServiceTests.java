package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationSessionResponse;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class GenerationSessionServiceTests {
    @Test
    void trimsAndUpdatesOwnedSessionTitleWithoutChangingLastMessageAt() {
        GenerationSessionMapper mapper = mock(GenerationSessionMapper.class);
        GenerationSession session = new GenerationSession();
        session.setId(101L);
        session.setTitle("新的标题");
        session.setCreatedAt(Instant.parse("2026-07-30T01:00:00Z"));
        session.setLastMessageAt(Instant.parse("2026-07-30T02:00:00Z"));
        when(mapper.updateTitle(101L, 7L, "新的标题")).thenReturn(1);
        when(mapper.selectOwnedById(101L, 7L)).thenReturn(session);

        GenerationSessionResponse response = new GenerationSessionService(mapper)
                .updateTitle(7L, 101L, "  新的标题  ");

        assertThat(response.sessionId()).isEqualTo("101");
        assertThat(response.title()).isEqualTo("新的标题");
        assertThat(response.lastMessageAt()).isEqualTo(Instant.parse("2026-07-30T02:00:00Z"));
        verify(mapper).updateTitle(101L, 7L, "新的标题");
    }

    @Test
    void rejectsBlankOrOverlongTitles() {
        GenerationSessionService service = new GenerationSessionService(mock(GenerationSessionMapper.class));

        assertThatThrownBy(() -> service.updateTitle(7L, 101L, "  "))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        assertThatThrownBy(() -> service.updateTitle(7L, 101L, "a".repeat(101)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void hidesUnownedOrMissingSessions() {
        GenerationSessionMapper mapper = mock(GenerationSessionMapper.class);
        when(mapper.updateTitle(101L, 7L, "新的标题")).thenReturn(0);

        assertThatThrownBy(() -> new GenerationSessionService(mapper).updateTitle(7L, 101L, "新的标题"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));
    }
}
