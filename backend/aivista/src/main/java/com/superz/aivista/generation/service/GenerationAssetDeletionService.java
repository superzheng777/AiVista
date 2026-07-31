package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 标记当前用户手动勾选的生成资产，并安排私有 OSS 异步清理。 */
@Service
public class GenerationAssetDeletionService {
    private final GenerationImageMapper imageMapper;
    private final Clock clock;

    public GenerationAssetDeletionService(GenerationImageMapper imageMapper, Clock clock) {
        this.imageMapper = imageMapper;
        this.clock = clock;
    }

    /**
     * 仅标记仍可见且归属当前用户的图片；未命中记录包含他人、不存在或已删除图片，按幂等成功处理。
     */
    @Transactional
    public void delete(long userId, List<String> imageIds) {
        List<Long> ids = normalizeImageIds(imageIds);
        Instant deletedAt = clock.instant();
        imageMapper.markVisibleDeletedByUserIdAndIds(userId, ids, deletedAt);
    }

    private static List<Long> normalizeImageIds(List<String> imageIds) {
        if (imageIds == null || imageIds.isEmpty()) {
            throw invalidImageIds();
        }
        List<Long> ids = new ArrayList<>(imageIds.size());
        Set<Long> uniqueIds = new HashSet<>(imageIds.size());
        for (String imageId : imageIds) {
            try {
                long value = Long.parseLong(imageId);
                if (value <= 0 || !uniqueIds.add(value)) {
                    throw invalidImageIds();
                }
                ids.add(value);
            } catch (NumberFormatException exception) {
                throw invalidImageIds();
            }
        }
        return ids;
    }

    private static BusinessException invalidImageIds() {
        return new BusinessException(ErrorCode.VALIDATION_ERROR, "imageIds 必须为不重复的正整数 ID");
    }
}
