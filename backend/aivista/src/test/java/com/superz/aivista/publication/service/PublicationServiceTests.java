package com.superz.aivista.publication.service;

import com.superz.aivista.common.transaction.TestTransactions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.publication.mapper.ImageAssetLikeMapper;
import com.superz.aivista.user.mapper.UserStatsMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PublicationServiceTests {
    private static final long USER_ID = 7L;
    private static final long IMAGE_ID = 42L;
    private static final Instant NOW = Instant.parse("2026-08-09T12:00:00Z");

    private final ImageAssetMapper images = mock(ImageAssetMapper.class);
    private final UserStatsMapper stats = mock(UserStatsMapper.class);
    private final ImageAssetLikeMapper likes = mock(ImageAssetLikeMapper.class);
    private final OutboxEventMapper outbox = mock(OutboxEventMapper.class);
    private PublicationService service;

    @BeforeEach
    void setUp() {
        service = new PublicationService(images, stats, likes, outbox, Clock.fixed(NOW, ZoneOffset.UTC), TestTransactions.immediate());
    }

    @Test
    void startsReviewForAPublishableImage() {
        when(images.selectVisibleOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(imageWithStatus(null));
        when(images.markPublicationPending(IMAGE_ID, "title", "description", NOW)).thenReturn(1);

        var response = service.request(USER_ID, IMAGE_ID, " title ", " description ");

        assertThat(response).hasToString("PublicationRequestResponse[imageId=42, status=PENDING]");
        verify(images).markPublicationPending(IMAGE_ID, "title", "description", NOW);
        verify(outbox).insertSelective(any());
        verifyNoInteractions(stats);
    }

    @Test
    void rejectsMissingOrUnownedAssetBeforeStartingReview() {
        assertThatThrownBy(() -> service.request(USER_ID, IMAGE_ID, "title", "description"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));

        verify(images, never()).markPublicationPending(anyLong(), any(), any(), any());
        verifyNoInteractions(stats, outbox);
    }

    @Test
    void returnsPendingWithoutCreatingAnotherReviewWhenAlreadyPending() {
        when(images.selectVisibleOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(imageWithStatus("PENDING"));

        var response = service.request(USER_ID, IMAGE_ID, "another title", "another description");

        assertThat(response).hasToString("PublicationRequestResponse[imageId=42, status=PENDING]");
        verify(images, never()).markPublicationPending(anyLong(), any(), any(), any());
        verify(outbox, never()).insertSelective(any());
    }

    @Test
    void rejectsAnAlreadyPublishedImage() {
        ImageAsset image = imageWithStatus("APPROVED");
        image.setPublicAt(NOW);
        when(images.selectVisibleOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(image);

        assertThatThrownBy(() -> service.request(USER_ID, IMAGE_ID, "title", "description"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        verify(outbox, never()).insertSelective(any());
    }

    @Test
    void withdrawRemovesCurrentPublicationLikesAndReceivedCount() {
        ImageAsset image = imageWithStatus("APPROVED");
        image.setPublicAt(NOW);
        image.setLikeCount(2L);
        when(images.selectOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(image);
        when(likes.deleteByAssetAndVersion(IMAGE_ID, 0L)).thenReturn(2);
        when(stats.changeReceivedLikeCount(USER_ID, -2)).thenReturn(1);

        service.withdraw(USER_ID, IMAGE_ID);

        verify(likes).deleteByAssetAndVersion(IMAGE_ID, 0L);
        verify(stats).changeReceivedLikeCount(USER_ID, -2);
        verify(images).withdrawPublication(IMAGE_ID);
        verify(outbox).insertSelective(any());
    }

    @Test
    void withdrawWithoutLikesDoesNotTouchAuthorStatistics() {
        ImageAsset image = imageWithStatus("APPROVED");
        image.setPublicAt(NOW);
        image.setLikeCount(0L);
        when(images.selectOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(image);

        service.withdraw(USER_ID, IMAGE_ID);

        verify(likes).deleteByAssetAndVersion(IMAGE_ID, 0L);
        verifyNoInteractions(stats);
        verify(images).withdrawPublication(IMAGE_ID);
        verify(outbox).insertSelective(any());
    }

    @Test
    void withdrawStillRejectsMismatchedCountsWhenNoLikesWereDeleted() {
        ImageAsset image = imageWithStatus("APPROVED");
        image.setPublicAt(NOW);
        image.setLikeCount(1L);
        when(images.selectOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(image);

        assertThatThrownBy(() -> service.withdraw(USER_ID, IMAGE_ID)).isInstanceOf(IllegalStateException.class);

        verifyNoInteractions(stats, outbox);
        verify(images, never()).withdrawPublication(IMAGE_ID);
    }

    @Test
    void withdrawStopsWhenReceivedCountCannotBeUpdated() {
        ImageAsset image = imageWithStatus("APPROVED");
        image.setPublicAt(NOW);
        image.setLikeCount(2L);
        when(images.selectOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(image);
        when(likes.deleteByAssetAndVersion(IMAGE_ID, 0L)).thenReturn(2);

        assertThatThrownBy(() -> service.withdraw(USER_ID, IMAGE_ID))
                .isInstanceOf(IllegalStateException.class);

        verify(images, never()).withdrawPublication(IMAGE_ID);
        verifyNoInteractions(outbox);
    }

    @Test
    void republishesWhenMysqlUpsertReportsTwoAffectedRows() {
        when(images.selectVisibleOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(imageWithStatus("NONE"));
        when(images.markPublicationPending(IMAGE_ID, "title", "description", NOW)).thenReturn(2);
        assertThat(service.request(USER_ID, IMAGE_ID, "title", "description").status()).isEqualTo("PENDING");
        verify(outbox).insertSelective(any());
    }

    private static ImageAsset imageWithStatus(String status) {
        ImageAsset image = new ImageAsset();
        image.setId(IMAGE_ID);
        image.setUserId(USER_ID);
        image.setPublicationReviewStatus(status);
        image.setPublicationVersion(0L);
        return image;
    }
}
