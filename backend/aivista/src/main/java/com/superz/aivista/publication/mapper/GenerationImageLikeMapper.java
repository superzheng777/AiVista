package com.superz.aivista.publication.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.publication.entity.GenerationImageLike;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface GenerationImageLikeMapper extends BaseMapper<GenerationImageLike> {
    @Insert("INSERT IGNORE INTO generation_image_likes (user_id, image_id, publication_version, liked_at) VALUES (#{userId}, #{imageId}, #{publicationVersion}, #{likedAt})")
    int insertIfAbsent(@Param("userId") long userId, @Param("imageId") long imageId,
            @Param("publicationVersion") long publicationVersion, @Param("likedAt") Instant likedAt);

    @Delete("DELETE FROM generation_image_likes WHERE user_id = #{userId} AND image_id = #{imageId} AND publication_version = #{publicationVersion}")
    int deleteByUserImageAndVersion(@Param("userId") long userId, @Param("imageId") long imageId,
            @Param("publicationVersion") long publicationVersion);

    @Delete("DELETE FROM generation_image_likes WHERE image_id = #{imageId} AND publication_version = #{publicationVersion}")
    int deleteByImageAndVersion(@Param("imageId") long imageId, @Param("publicationVersion") long publicationVersion);

    @Select("""
            <script>
            SELECT l.image_id FROM generation_image_likes l
            INNER JOIN generation_images i ON i.id = l.image_id AND i.publication_version = l.publication_version
            WHERE l.user_id = #{userId} AND l.image_id IN
            <foreach collection="imageIds" item="imageId" open="(" separator="," close=")">#{imageId}</foreach>
            </script>
            """)
    List<Long> selectCurrentLikedImageIds(@Param("userId") long userId, @Param("imageIds") List<Long> imageIds);

    @Select("""
            SELECT l.* FROM generation_image_likes l
            INNER JOIN generation_images i ON i.id = l.image_id AND i.publication_version = l.publication_version
            WHERE l.user_id = #{userId} AND i.public_at IS NOT NULL AND i.publication_review_status = 'APPROVED'
            ORDER BY l.liked_at DESC, l.image_id DESC
            """)
    List<GenerationImageLike> selectCurrentVisibleByUserId(@Param("userId") long userId);
}
