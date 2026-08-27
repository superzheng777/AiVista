package com.superz.aivista.publication.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.publication.entity.ImageAssetLike;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface ImageAssetLikeMapper extends BaseMapper<ImageAssetLike> {
    @Insert("INSERT IGNORE INTO image_asset_likes (user_id, asset_id, publication_version, liked_at) VALUES (#{userId}, #{assetId}, #{publicationVersion}, #{likedAt})")
    int insertIfAbsent(@Param("userId") long userId, @Param("assetId") long assetId,
            @Param("publicationVersion") long publicationVersion, @Param("likedAt") Instant likedAt);

    @Delete("DELETE FROM image_asset_likes WHERE user_id = #{userId} AND asset_id = #{assetId} AND publication_version = #{publicationVersion}")
    int deleteByUserAssetAndVersion(@Param("userId") long userId, @Param("assetId") long assetId,
            @Param("publicationVersion") long publicationVersion);

    @Delete("DELETE FROM image_asset_likes WHERE asset_id = #{assetId} AND publication_version = #{publicationVersion}")
    int deleteByAssetAndVersion(@Param("assetId") long assetId, @Param("publicationVersion") long publicationVersion);

    @Select("""
            <script>
            SELECT l.asset_id FROM image_asset_likes l INNER JOIN image_publications p
            ON p.asset_id = l.asset_id AND p.publication_version = l.publication_version
            WHERE l.user_id = #{userId} AND l.asset_id IN
            <foreach collection="assetIds" item="assetId" open="(" separator="," close=")">#{assetId}</foreach>
            </script>
            """)
    List<Long> selectCurrentLikedAssetIds(@Param("userId") long userId, @Param("assetIds") List<Long> assetIds);

    @Select("""
            SELECT l.* FROM image_asset_likes l INNER JOIN image_publications p
            ON p.asset_id = l.asset_id AND p.publication_version = l.publication_version
            WHERE l.user_id = #{userId} AND p.public_at IS NOT NULL AND p.review_status = 'APPROVED'
            ORDER BY l.liked_at DESC, l.asset_id DESC
            """)
    List<ImageAssetLike> selectCurrentVisibleByUserId(@Param("userId") long userId);
}
