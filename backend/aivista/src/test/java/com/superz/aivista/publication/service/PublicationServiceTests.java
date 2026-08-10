package com.superz.aivista.publication.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PublicationServiceTests {
    private static final long USER_ID = 7L;
    private static final long IMAGE_ID = 42L;
    private static final Instant NOW = Instant.parse("2026-08-09T12:00:00Z");

    private final GenerationImageMapper images = mock(GenerationImageMapper.class);
    private final UserMapper users = mock(UserMapper.class);
    private final OutboxEventMapper outbox = mock(OutboxEventMapper.class);
    private PublicationService service;

    @BeforeEach
    void setUp() {
        service = new PublicationService(images, users, outbox, Clock.fixed(NOW, ZoneOffset.UTC));
        when(users.selectIdForUpdate(USER_ID)).thenReturn(USER_ID);
    }

    @Test
    void startsReviewForAPublishableImage() {
        when(images.selectOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(imageWithStatus("NONE"));

        var response = service.request(USER_ID, IMAGE_ID, " title ", " description ");

        assertThat(response).hasToString("PublicationRequestResponse[imageId=42, status=PENDING]");
        verify(images).markPublicationPending(IMAGE_ID, "title", "description", NOW);
        verify(outbox).insertSelective(any());
    }

    @Test
    void returnsPendingWithoutCreatingAnotherReviewWhenAlreadyPending() {
        when(images.selectOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(imageWithStatus("PENDING"));

        var response = service.request(USER_ID, IMAGE_ID, "another title", "another description");

        assertThat(response).hasToString("PublicationRequestResponse[imageId=42, status=PENDING]");
        verify(images, never()).markPublicationPending(anyLong(), any(), any(), any());
        verify(outbox, never()).insertSelective(any());
    }

    @Test
    void rejectsAnAlreadyPublishedImage() {
        GenerationImage image = imageWithStatus("APPROVED");
        image.setPublicAt(NOW);
        when(images.selectOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(image);

        assertThatThrownBy(() -> service.request(USER_ID, IMAGE_ID, "title", "description"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
        verify(outbox, never()).insertSelective(any());
    }

    private static GenerationImage imageWithStatus(String status) {
        GenerationImage image = new GenerationImage();
        image.setId(IMAGE_ID);
        image.setPublicationReviewStatus(status);
        image.setPublicationVersion(0L);
        return image;
    }
}
