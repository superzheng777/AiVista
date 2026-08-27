package com.superz.aivista.publication.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import com.superz.aivista.publication.mapper.ImageAssetLikeMapper;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.superz.aivista.search.service.SearchIndexOutboxEvent;

@Service
public class GenerationImageLikeService {
    private final ImageAssetMapper imageMapper;
    private final ImageAssetLikeMapper likeMapper;
    private final UserMapper userMapper;
    private final UserNotificationMapper notificationMapper;
    private final OutboxEventMapper outboxEventMapper;
    private final LikeRateLimiter rateLimiter;
    private final Clock clock;

    public GenerationImageLikeService(ImageAssetMapper imageMapper, ImageAssetLikeMapper likeMapper,
            UserMapper userMapper, UserNotificationMapper notificationMapper, OutboxEventMapper outboxEventMapper,
            LikeRateLimiter rateLimiter, Clock clock) {
        this.imageMapper = imageMapper;
        this.likeMapper = likeMapper;
        this.userMapper = userMapper;
        this.notificationMapper = notificationMapper;
        this.outboxEventMapper = outboxEventMapper;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
    }

    @Transactional
    public void like(long userId, long imageId, long publicationVersion) {
        rateLimiter.check(userId, imageId);
        change(userId, imageId, publicationVersion, true);
    }

    @Transactional
    public void unlike(long userId, long imageId, long publicationVersion) {
        rateLimiter.check(userId, imageId);
        change(userId, imageId, publicationVersion, false);
    }

    private void change(long userId, long imageId, long publicationVersion, boolean liked) {
        ImageAsset image = imageMapper.selectByAssetIdForUpdate(imageId);
        if (!isCurrentPublicVersion(image, publicationVersion)) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        int changed = liked
                ? likeMapper.insertIfAbsent(userId, imageId, publicationVersion, clock.instant())
                : likeMapper.deleteByUserAssetAndVersion(userId, imageId, publicationVersion);
        if (changed == 0) {
            return;
        }
        if (userMapper.selectIdForUpdate(image.getUserId()) == null
                || imageMapper.changeLikeCount(imageId, liked ? 1 : -1) != 1
                || userMapper.changeReceivedLikeCount(image.getUserId(), liked ? 1 : -1) != 1) {
            throw new IllegalStateException("Like counters are inconsistent");
        }
        outboxEventMapper.insertSelective(SearchIndexOutboxEvent.create(
                imageId, publicationVersion, clock.instant()));
        if (liked && userId != image.getUserId()) {
            createImageLikeNotification(userId, imageId, publicationVersion, image.getUserId());
        }
    }

    private void createImageLikeNotification(long actorUserId, long imageId, long publicationVersion,
            long recipientUserId) {
        UserNotification notification = new UserNotification();
        notification.setRecipientUserId(recipientUserId);
        notification.setCategory("INTERACTION");
        notification.setEventType("IMAGE_LIKED");
        notification.setActorUserId(actorUserId);
        notification.setImageId(imageId);
        notification.setPublicationVersion(publicationVersion);
        notification.setTitle("作品获得点赞");
        notification.setContent("有人点赞了你的作品");
        notification.setMetadataJson("{\"actorUserId\":\"" + actorUserId + "\",\"imageId\":\""
                + imageId + "\",\"publicationVersion\":\"" + publicationVersion + "\"}");
        notification.setCreatedAt(clock.instant());
        if (notificationMapper.insertImageLikeInteractionIfAbsent(notification) == 0) return;
        if (notification.getId() == null) throw new IllegalStateException("Cannot create like notification");
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.INTERACTION_NOTIFICATION_CREATED.name());
        event.setAggregateType("USER_NOTIFICATION");
        event.setAggregateId(notification.getId());
        event.setAggregateVersion(1L);
        event.setPayloadJson("{\"recipientUserId\":\"" + recipientUserId + "\",\"notificationId\":\""
                + notification.getId() + "\"}");
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(clock.instant());
        event.setCreatedAt(clock.instant());
        event.setUpdatedAt(clock.instant());
        outboxEventMapper.insertSelective(event);
    }

    private static boolean isCurrentPublicVersion(ImageAsset image, long publicationVersion) {
        return image != null && image.getPublicAt() != null && "APPROVED".equals(image.getPublicationReviewStatus())
                && image.getPublicationVersion() != null && image.getPublicationVersion() == publicationVersion;
    }
}
