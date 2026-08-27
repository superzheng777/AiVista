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
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.publication.service.InspirationQueryService;
import com.superz.aivista.search.client.MeilisearchSearchClient;
import com.superz.aivista.search.client.MeilisearchSearchException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class InspirationSearchServiceTests {
    private final MeilisearchSearchClient client = mock(MeilisearchSearchClient.class);
    private final ImageAssetMapper images = mock(ImageAssetMapper.class);
    private final InspirationQueryService inspirationQuery = mock(InspirationQueryService.class);
    private final InspirationSearchService service = new InspirationSearchService(client, images, inspirationQuery);

    @Test
    void filtersStaleHitsAndAdvancesRawOffsetUntilPageIsFull() {
        List<Long> first = java.util.stream.LongStream.rangeClosed(1, 30).boxed().toList();
        List<Long> second = java.util.stream.LongStream.rangeClosed(31, 60).boxed().toList();
        when(client.search("ai 星空", 0, 30)).thenReturn(first);
        when(client.search("ai 星空", 30, 30)).thenReturn(second);
        when(images.selectPublishedByIds(first)).thenReturn(first.stream().filter(id -> id > 2).map(this::image).toList());
        when(images.selectPublishedByIds(second)).thenReturn(second.stream().map(this::image).toList());
        when(inspirationQuery.toPublicImages(anyList(), eq(7L))).thenReturn(List.of());

        var response = service.search("ＡＩ，星空", null, 7L);

        assertThat(response.nextOffset()).isEqualTo(32);
        ArgumentCaptor<List<ImageAsset>> collected = ArgumentCaptor.forClass(List.class);
        verify(inspirationQuery).toPublicImages(collected.capture(), eq(7L));
        assertThat(collected.getValue()).extracting(ImageAsset::getId)
                .containsExactlyElementsOf(java.util.stream.LongStream.rangeClosed(3, 32).boxed().toList());
    }

    @Test
    void pureSymbolsUseEmptyPlaceholderQuery() {
        when(client.search("", 0, 30)).thenReturn(List.of());
        when(inspirationQuery.toPublicImages(anyList(), eq(null))).thenReturn(List.of());
        assertThat(service.search("？！🚀", null, null).nextOffset()).isNull();
        verify(client).search("", 0, 30);
    }

    @Test
    void validatesBlankLengthAndOffset() {
        assertError(() -> service.search("   ", null, null), ErrorCode.BAD_REQUEST);
        assertError(() -> service.search("a".repeat(101), null, null), ErrorCode.BAD_REQUEST);
        assertError(() -> service.search("ai", 200, null), ErrorCode.VALIDATION_ERROR);
    }

    @Test
    void mapsClientFailureToStableUnavailableError() {
        when(client.search("ai", 0, 30)).thenThrow(new MeilisearchSearchException(new RuntimeException()));
        assertError(() -> service.search("ai", null, null), ErrorCode.SEARCH_UNAVAILABLE);
    }

    private ImageAsset image(long id) {
        ImageAsset image = new ImageAsset();
        image.setId(id);
        return image;
    }

    private static void assertError(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(code));
    }
}
