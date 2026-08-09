package com.superz.aivista.publication.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.idempotency.IdempotencyRecord;
import com.superz.aivista.common.idempotency.IdempotencyRecordMapper;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import com.superz.aivista.publication.dto.PublicationRequestResponse;
import com.superz.aivista.user.mapper.UserMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicationService {
    private static final String IDEMPOTENCY_SCOPE = "PUBLICATION_REQUEST";

    private final GenerationImageMapper imageMapper;
    private final UserMapper userMapper;
    private final IdempotencyRecordMapper idempotencyRecords;
    private final OutboxEventMapper outboxEventMapper;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    public PublicationService(GenerationImageMapper imageMapper, UserMapper userMapper,
            IdempotencyRecordMapper idempotencyRecords, OutboxEventMapper outboxEventMapper,
            Clock clock, ObjectMapper objectMapper) {
        this.imageMapper = imageMapper;
        this.userMapper = userMapper;
        this.idempotencyRecords = idempotencyRecords;
        this.outboxEventMapper = outboxEventMapper;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public PublicationRequestResponse request(long userId, long imageId, String idempotencyKey,
            String title, String description) {
        if (!isCanonicalUuid(idempotencyKey)) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "Idempotency-Key必须是UUID v4格式");
        }
        String normalizedTitle = title.trim();
        String normalizedDescription = description.trim();
        String fingerprint = fingerprint(userId, imageId, normalizedTitle, normalizedDescription);
        if (userMapper.selectIdForUpdate(userId) == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        IdempotencyRecord existing = idempotencyRecords.selectByOwnerScopeAndKeyForUpdate(
                userId, IDEMPOTENCY_SCOPE, idempotencyKey);
        if (existing != null) {
            return idempotentResponse(existing, fingerprint);
        }

        GenerationImage image = imageMapper.selectOwnedByIdForUpdate(imageId, userId);
        if (image == null || image.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        if (image.getPublicAt() != null || !canRequestPublication(image.getPublicationReviewStatus())) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "图片已发布或正在审核");
        }
        Instant now = clock.instant();
        imageMapper.markPublicationPending(imageId, normalizedTitle, normalizedDescription, now);
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.PUBLICATION_TEXT_REVIEW.name());
        event.setAggregateType("GENERATION_IMAGE");
        event.setAggregateId(imageId);
        event.setAggregateVersion(image.getPublicationVersion() + 1);
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        outboxEventMapper.insertSelective(event);

        PublicationRequestResponse response = new PublicationRequestResponse(String.valueOf(imageId), "PENDING");
        saveIdempotencyRecord(userId, idempotencyKey, fingerprint, imageId, response, now);
        return response;
    }

    @Transactional
    public void withdraw(long userId, long imageId) {
        GenerationImage image = imageMapper.selectOwnedByIdForUpdate(imageId, userId);
        if (image == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        imageMapper.withdrawPublication(imageId, clock.instant());
    }

    private PublicationRequestResponse idempotentResponse(IdempotencyRecord record, String fingerprint) {
        if (!fingerprint.equals(record.getRequestFingerprint())) {
            throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
        }
        try {
            var response = objectMapper.readTree(record.getResponseBody());
            return new PublicationRequestResponse(response.required("imageId").asText(),
                    response.required("status").asText());
        } catch (Exception exception) {
            throw new IllegalStateException("Invalid persisted publication idempotency response", exception);
        }
    }

    private void saveIdempotencyRecord(long userId, String idempotencyKey, String fingerprint, long imageId,
            PublicationRequestResponse response, Instant now) {
        try {
            IdempotencyRecord record = new IdempotencyRecord();
            record.setOwnerId(userId);
            record.setScope(IDEMPOTENCY_SCOPE);
            record.setIdempotencyKey(idempotencyKey);
            record.setRequestFingerprint(fingerprint);
            record.setResourceType("GENERATION_IMAGE");
            record.setResourceId(imageId);
            record.setResponseStatus(202);
            record.setResponseBody(objectMapper.writeValueAsString(Map.of(
                    "imageId", response.imageId(), "status", response.status())));
            record.setCreatedAt(now);
            record.setExpiresAt(now.plus(Duration.ofMinutes(30)));
            idempotencyRecords.insertSelective(record);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot persist publication idempotency response", exception);
        }
    }

    private static boolean canRequestPublication(String reviewStatus) {
        return "NONE".equals(reviewStatus) || "REJECTED".equals(reviewStatus) || "FAILED".equals(reviewStatus);
    }

    private static String fingerprint(long userId, long imageId, String title, String description) {
        String canonical = field("userId", Long.toString(userId))
                + field("imageId", Long.toString(imageId))
                + field("title", title)
                + field("description", description);
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }

    private static String field(String name, String value) {
        return name + ':' + value.getBytes(StandardCharsets.UTF_8).length + ':' + value + '\n';
    }

    private static boolean isCanonicalUuid(String value) {
        if (value == null) {
            return false;
        }
        try {
            UUID uuid = UUID.fromString(value);
            return uuid.version() == 4 && uuid.toString().equals(value);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
