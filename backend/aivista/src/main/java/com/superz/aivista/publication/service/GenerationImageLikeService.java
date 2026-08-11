package com.superz.aivista.publication.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.publication.mapper.GenerationImageLikeMapper;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GenerationImageLikeService {
    private final GenerationImageMapper imageMapper;
    private final GenerationImageLikeMapper likeMapper;
    private final UserMapper userMapper;
    private final LikeRateLimiter rateLimiter;
    private final Clock clock;

    public GenerationImageLikeService(GenerationImageMapper imageMapper, GenerationImageLikeMapper likeMapper,
            UserMapper userMapper, LikeRateLimiter rateLimiter, Clock clock) {
        this.imageMapper = imageMapper;
        this.likeMapper = likeMapper;
        this.userMapper = userMapper;
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
        GenerationImage image = imageMapper.selectByImageIdForUpdate(imageId);
        if (!isCurrentPublicVersion(image, publicationVersion)) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        int changed = liked
                ? likeMapper.insertIfAbsent(userId, imageId, publicationVersion, clock.instant())
                : likeMapper.deleteByUserImageAndVersion(userId, imageId, publicationVersion);
        if (changed == 0) {
            return;
        }
        if (userMapper.selectIdForUpdate(image.getUserId()) == null
                || imageMapper.changeLikeCount(imageId, liked ? 1 : -1) != 1
                || userMapper.changeReceivedLikeCount(image.getUserId(), liked ? 1 : -1) != 1) {
            throw new IllegalStateException("Like counters are inconsistent");
        }
    }

    private static boolean isCurrentPublicVersion(GenerationImage image, long publicationVersion) {
        return image != null && image.getPublicAt() != null && "APPROVED".equals(image.getPublicationReviewStatus())
                && image.getPublicationVersion() != null && image.getPublicationVersion() == publicationVersion;
    }
}
