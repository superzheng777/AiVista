package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationImageFavoriteServiceTests {

    @Test
    void setsAllImagesToTheRequestedFavoriteState() {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        when(imageMapper.selectVisibleOwnedIdsForUpdate(7L, List.of(101L, 102L))).thenReturn(List.of(101L, 102L));

        new GenerationImageFavoriteService(imageMapper).setFavorites(7L, List.of("101", "102"), true);

        verify(imageMapper).setFavoriteByUserIdAndIds(7L, List.of(101L, 102L), true);
    }

    @Test
    void rejectsInvalidOrUnavailableImageIdsWithoutUpdating() {
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        GenerationImageFavoriteService service = new GenerationImageFavoriteService(imageMapper);

        assertThatThrownBy(() -> service.setFavorites(7L, List.of("101", "101"), true))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        when(imageMapper.selectVisibleOwnedIdsForUpdate(7L, List.of(101L))).thenReturn(List.of());
        assertThatThrownBy(() -> service.setFavorites(7L, List.of("101"), false))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));
        verify(imageMapper, never()).setFavoriteByUserIdAndIds(anyLong(), anyList(), anyBoolean());
    }
}
