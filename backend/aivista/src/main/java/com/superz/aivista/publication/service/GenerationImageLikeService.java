package com.superz.aivista.publication.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.publication.mapper.ImageAssetLikeMapper;
import com.superz.aivista.user.mapper.UserStatsMapper;
import com.superz.aivista.user.service.InteractionNotificationWriter;
import com.superz.aivista.common.transaction.RetryingTransaction;
import java.time.Clock;
import org.springframework.stereotype.Service;
import com.superz.aivista.search.service.SearchIndexOutboxEvent;

@Service
public class GenerationImageLikeService {
    private final ImageAssetMapper imageMapper;
    private final ImageAssetLikeMapper likeMapper;
    private final UserStatsMapper stats;
    private final InteractionNotificationWriter notifications;
    private final OutboxEventMapper outboxEventMapper;
    private final LikeRateLimiter rateLimiter;
    private final Clock clock;
    private final RetryingTransaction transactions;

    public GenerationImageLikeService(ImageAssetMapper imageMapper, ImageAssetLikeMapper likeMapper,
            UserStatsMapper stats, InteractionNotificationWriter notifications, OutboxEventMapper outboxEventMapper,
            LikeRateLimiter rateLimiter, Clock clock, RetryingTransaction transactions) {
        this.imageMapper = imageMapper;
        this.likeMapper = likeMapper;
        this.stats = stats;
        this.notifications = notifications;
        this.outboxEventMapper = outboxEventMapper;
        this.rateLimiter = rateLimiter;
        this.clock = clock;
        this.transactions = transactions;
    }

    public void like(long userId, long imageId, long publicationVersion) {
        rateLimiter.check(userId, imageId);
        transactions.run(() -> change(userId, imageId, publicationVersion, true));
    }

    public void unlike(long userId, long imageId, long publicationVersion) {
        rateLimiter.check(userId, imageId);
        transactions.run(() -> change(userId, imageId, publicationVersion, false));
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
        if (imageMapper.changeLikeCount(imageId, liked ? 1 : -1) != 1
                || stats.changeReceivedLikeCount(image.getUserId(), liked ? 1 : -1) != 1) {
            throw new IllegalStateException("Like counters are inconsistent");
        }
        outboxEventMapper.insertSelective(SearchIndexOutboxEvent.create(
                imageId, publicationVersion, clock.instant()));
        if (liked) {
            notifications.liked(userId, image.getUserId(), imageId, publicationVersion);
        }
    }

    private static boolean isCurrentPublicVersion(ImageAsset image, long publicationVersion) {
        return image != null && image.getPublicAt() != null && "APPROVED".equals(image.getPublicationReviewStatus())
                && image.getPublicationVersion() != null && image.getPublicationVersion() == publicationVersion;
    }
}
