package com.superz.aivista.search.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.publication.service.InspirationQueryService;
import com.superz.aivista.search.client.MeilisearchSearchClient;
import com.superz.aivista.search.client.MeilisearchSearchException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class InspirationSearchServiceTests {
    private final MeilisearchSearchClient client = mock(MeilisearchSearchClient.class);
    private final GenerationImageMapper images = mock(GenerationImageMapper.class);
    private final InspirationQueryService inspirationQuery = mock(InspirationQueryService.class);
    private final InspirationSearchService service = new InspirationSearchService(client, images, inspirationQuery);

    @Test
    void filtersStaleHitsAndAdvancesRawOffsetUntilPageIsFull() {
        List<Long> first = java.util.stream.LongStream.rangeClosed(1, 20).boxed().toList();
        List<Long> second = java.util.stream.LongStream.rangeClosed(21, 40).boxed().toList();
        when(client.search("ai 星空", 0, 20)).thenReturn(first);
        when(client.search("ai 星空", 20, 20)).thenReturn(second);
        when(images.selectPublishedByIds(first)).thenReturn(first.stream().filter(id -> id > 2).map(this::image).toList());
        when(images.selectPublishedByIds(second)).thenReturn(second.stream().map(this::image).toList());
        when(inspirationQuery.toPublicImages(anyList(), eq(7L))).thenReturn(List.of());

        var response = service.search("ＡＩ，星空", null, 7L);

        assertThat(response.nextOffset()).isEqualTo(22);
        ArgumentCaptor<List<GenerationImage>> collected = ArgumentCaptor.forClass(List.class);
        verify(inspirationQuery).toPublicImages(collected.capture(), eq(7L));
        assertThat(collected.getValue()).extracting(GenerationImage::getId)
                .containsExactlyElementsOf(java.util.stream.LongStream.rangeClosed(3, 22).boxed().toList());
    }

    @Test
    void pureSymbolsUseEmptyPlaceholderQuery() {
        when(client.search("", 0, 20)).thenReturn(List.of());
        when(inspirationQuery.toPublicImages(anyList(), eq(null))).thenReturn(List.of());
        assertThat(service.search("？！🚀", null, null).nextOffset()).isNull();
        verify(client).search("", 0, 20);
    }

    @Test
    void validatesBlankLengthAndOffset() {
        assertError(() -> service.search("   ", null, null), ErrorCode.BAD_REQUEST);
        assertError(() -> service.search("a".repeat(101), null, null), ErrorCode.BAD_REQUEST);
        assertError(() -> service.search("ai", 200, null), ErrorCode.VALIDATION_ERROR);
    }

    @Test
    void mapsClientFailureToStableUnavailableError() {
        when(client.search("ai", 0, 20)).thenThrow(new MeilisearchSearchException(new RuntimeException()));
        assertError(() -> service.search("ai", null, null), ErrorCode.SEARCH_UNAVAILABLE);
    }

    private GenerationImage image(long id) {
        GenerationImage image = new GenerationImage();
        image.setId(id);
        return image;
    }

    private static void assertError(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(code));
    }
}
