package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationAssetDeletionServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-01T02:00:00Z");

    @Test
    void marksOnlySelectedImagesForCurrentUser() {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);

        service(imageMapper).delete(7L, List.of("101", "102"));

        verify(imageMapper).markVisibleDeletedByUserIdAndIds(7L, List.of(101L, 102L), NOW);
    }

    @Test
    void rejectsDuplicateOrInvalidImageIdsBeforeDatabaseUpdate() {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        GenerationAssetDeletionService service = service(imageMapper);

        assertThatThrownBy(() -> service.delete(7L, List.of("101", "101")))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        assertThatThrownBy(() -> service.delete(7L, List.of("invalid")))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        verify(imageMapper, never()).markVisibleDeletedByUserIdAndIds(anyLong(), anyList(), any());
    }

    private static GenerationAssetDeletionService service(GenerationImageMapper imageMapper) {
        return new GenerationAssetDeletionService(imageMapper, Clock.fixed(NOW, ZoneOffset.UTC));
    }
}
