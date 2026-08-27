package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 管理当前用户生成图片的收藏状态。 */
@Service
public class GenerationImageFavoriteService {
    private final ImageAssetMapper imageMapper;

    public GenerationImageFavoriteService(ImageAssetMapper imageMapper) {
        this.imageMapper = imageMapper;
    }

    /** 将全部指定图片写成同一个目标收藏状态；重复调用不改变最终结果。 */
    @Transactional
    public void setFavorites(long userId, List<String> imageIds, boolean favorite) {
        List<Long> ids = normalizeImageIds(imageIds);
        if (imageMapper.selectVisibleOwnedIdsForUpdate(userId, ids).size() != ids.size()) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        imageMapper.setFavoriteByUserIdAndIds(userId, ids, favorite);
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
