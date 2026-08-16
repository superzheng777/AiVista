package com.superz.aivista.publication.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import com.superz.aivista.publication.dto.PublicationRequestResponse;
import com.superz.aivista.publication.mapper.GenerationImageLikeMapper;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.superz.aivista.search.service.SearchIndexOutboxEvent;

@Service
public class PublicationService {
    private final GenerationImageMapper imageMapper;
    private final UserMapper userMapper;
    private final GenerationImageLikeMapper likeMapper;
    private final OutboxEventMapper outboxEventMapper;
    private final Clock clock;

    public PublicationService(GenerationImageMapper imageMapper, UserMapper userMapper,
            GenerationImageLikeMapper likeMapper, OutboxEventMapper outboxEventMapper, Clock clock) {
        this.imageMapper = imageMapper;
        this.userMapper = userMapper;
        this.likeMapper = likeMapper;
        this.outboxEventMapper = outboxEventMapper;
        this.clock = clock;
    }

    @Transactional
    public PublicationRequestResponse request(long userId, long imageId, String title, String description) {
        String normalizedTitle = title.trim();
        String normalizedDescription = description.trim();
        if (userMapper.selectIdForUpdate(userId) == null) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }

        GenerationImage image = imageMapper.selectOwnedByIdForUpdate(imageId, userId);
        if (image == null || image.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        if ("PENDING".equals(image.getPublicationReviewStatus())) {
            return new PublicationRequestResponse(String.valueOf(imageId), "PENDING");
        }
        if (image.getPublicAt() != null || !canRequestPublication(image.getPublicationReviewStatus())) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "图片已发布，请先撤销发布");
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

        return new PublicationRequestResponse(String.valueOf(imageId), "PENDING");
    }

    @Transactional
    public void withdraw(long userId, long imageId) {
        GenerationImage image = imageMapper.selectOwnedByIdForUpdate(imageId, userId);
        if (image == null) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        long likeCount = image.getLikeCount() == null ? 0 : image.getLikeCount();
        boolean wasPublic = image.getPublicAt() != null;
        if (wasPublic) {
            int deleted = likeMapper.deleteByImageAndVersion(imageId, image.getPublicationVersion());
            if (deleted != likeCount || userMapper.selectIdForUpdate(image.getUserId()) == null
                    || userMapper.changeReceivedLikeCount(image.getUserId(), -deleted) != 1) {
                throw new IllegalStateException("Publication like counters are inconsistent");
            }
        }
        Instant now = clock.instant();
        imageMapper.withdrawPublication(imageId, now);
        if (wasPublic) {
            outboxEventMapper.insertSelective(SearchIndexOutboxEvent.create(
                    imageId, image.getPublicationVersion() == null ? 0 : image.getPublicationVersion(), now));
        }
    }

    private static boolean canRequestPublication(String reviewStatus) {
        return "NONE".equals(reviewStatus) || "REJECTED".equals(reviewStatus) || "FAILED".equals(reviewStatus);
    }

}
