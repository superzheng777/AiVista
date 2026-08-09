package com.superz.aivista.publication.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.idempotency.IdempotencyRecord;
import com.superz.aivista.common.idempotency.IdempotencyRecordMapper;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class PublicationServiceTests {
    private static final long USER_ID = 7L;
    private static final long IMAGE_ID = 42L;
    private static final String KEY = "b719c741-8607-4b0f-9a72-2dcbfdd6b6ee";
    private static final Instant NOW = Instant.parse("2026-08-09T12:00:00Z");

    private final GenerationImageMapper images = mock(GenerationImageMapper.class);
    private final UserMapper users = mock(UserMapper.class);
    private final IdempotencyRecordMapper idempotency = mock(IdempotencyRecordMapper.class);
    private final OutboxEventMapper outbox = mock(OutboxEventMapper.class);
    private PublicationService service;

    @BeforeEach
    void setUp() {
        service = new PublicationService(images, users, idempotency, outbox,
                Clock.fixed(NOW, ZoneOffset.UTC), new ObjectMapper());
        when(users.selectIdForUpdate(USER_ID)).thenReturn(USER_ID);
    }

    @Test
    void persistsAcceptedResponseForFutureRetries() {
        when(images.selectOwnedByIdForUpdate(IMAGE_ID, USER_ID)).thenReturn(publishableImage());

        var response = service.request(USER_ID, IMAGE_ID, KEY, " title ", " description ");

        assertThat(response).hasToString("PublicationRequestResponse[imageId=42, status=PENDING]");
        verify(images).markPublicationPending(IMAGE_ID, "title", "description", NOW);
        ArgumentCaptor<IdempotencyRecord> record = ArgumentCaptor.forClass(IdempotencyRecord.class);
        verify(idempotency).insertSelective(record.capture());
        assertThat(record.getValue().getScope()).isEqualTo("PUBLICATION_REQUEST");
        assertThat(record.getValue().getResponseBody()).contains("\"imageId\":\"42\"", "\"status\":\"PENDING\"");
    }

    @Test
    void returnsFirstResponseWithoutCreatingAnotherReview() {
        IdempotencyRecord record = new IdempotencyRecord();
        record.setRequestFingerprint(fingerprintFor("title", "description"));
        record.setResponseBody("{\"imageId\":\"42\",\"status\":\"PENDING\"}");
        when(idempotency.selectByOwnerScopeAndKeyForUpdate(USER_ID, "PUBLICATION_REQUEST", KEY)).thenReturn(record);

        var response = service.request(USER_ID, IMAGE_ID, KEY, "title", "description");

        assertThat(response.imageId()).isEqualTo("42");
        verify(images, never()).selectOwnedByIdForUpdate(anyLong(), anyLong());
        verify(outbox, never()).insertSelective(any());
    }

    @Test
    void rejectsReuseOfKeyForDifferentPublicationContent() {
        IdempotencyRecord record = new IdempotencyRecord();
        record.setRequestFingerprint("different");
        when(idempotency.selectByOwnerScopeAndKeyForUpdate(USER_ID, "PUBLICATION_REQUEST", KEY)).thenReturn(record);

        assertThatThrownBy(() -> service.request(USER_ID, IMAGE_ID, KEY, "title", "description"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.IDEMPOTENCY_KEY_CONFLICT));
    }

    private static GenerationImage publishableImage() {
        GenerationImage image = new GenerationImage();
        image.setId(IMAGE_ID);
        image.setPublicationReviewStatus("NONE");
        image.setPublicationVersion(0L);
        return image;
    }

    private static String fingerprintFor(String title, String description) {
        try {
            String canonical = "userId:1:7\nimageId:2:42\ntitle:" + title.length() + ":" + title
                    + "\ndescription:" + description.length() + ":" + description + "\n";
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new AssertionError(exception);
        }
    }
}
