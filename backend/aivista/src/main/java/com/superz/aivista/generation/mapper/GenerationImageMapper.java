package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.dto.GenerationAssetImageRow;
import com.superz.aivista.generation.entity.GenerationImage;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 生成结果图片数据访问接口。 */
public interface GenerationImageMapper extends BaseMapper<GenerationImage> {

    @Select("""
            SELECT id, task_id, user_id, object_key, content_type, file_size, width, height, source_index,
                   deleted_at, oss_cleanup_status, oss_cleanup_attempt_count, oss_cleanup_available_at,
                   oss_cleanup_last_error, created_at
            FROM generation_images
            WHERE task_id = #{taskId}
            ORDER BY source_index ASC
            """)
    List<GenerationImage> selectByTaskId(@Param("taskId") long taskId);

    @Select("""
            <script>
            SELECT id, task_id, user_id, object_key, content_type, file_size, width, height, source_index,
                   deleted_at, oss_cleanup_status, oss_cleanup_attempt_count, oss_cleanup_available_at,
                   oss_cleanup_last_error, created_at
            FROM generation_images
            WHERE task_id IN
            <foreach collection="taskIds" item="taskId" open="(" separator="," close=")">
                #{taskId}
            </foreach>
            ORDER BY task_id ASC, source_index ASC
            </script>
            """)
    List<GenerationImage> selectByTaskIds(@Param("taskIds") List<Long> taskIds);

    @Select("""
            <script>
            SELECT i.id AS image_id, i.object_key, i.width, i.height, i.created_at,
                   t.final_prompt, t.final_negative_prompt
            FROM generation_images i
            INNER JOIN generation_tasks t ON t.id = i.task_id
            WHERE i.user_id = #{userId}
              AND i.deleted_at IS NULL
            <if test="cursorCreatedAt != null">
              AND (i.created_at &lt; #{cursorCreatedAt}
                   OR (i.created_at = #{cursorCreatedAt} AND i.id &lt; #{cursorImageId}))
            </if>
            ORDER BY i.created_at DESC, i.id DESC
            LIMIT #{limit}
            </script>
            """)
    List<GenerationAssetImageRow> selectVisiblePageByUserId(
            @Param("userId") long userId,
            @Param("cursorCreatedAt") Instant cursorCreatedAt,
            @Param("cursorImageId") Long cursorImageId,
            @Param("limit") int limit);

    @Update("""
            <script>
            UPDATE generation_images
            SET deleted_at = #{deletedAt},
                oss_cleanup_status = 'PENDING',
                oss_cleanup_attempt_count = 0,
                oss_cleanup_available_at = #{deletedAt},
                oss_cleanup_last_error = NULL
            WHERE user_id = #{userId}
              AND deleted_at IS NULL
              AND id IN
            <foreach collection="imageIds" item="imageId" open="(" separator="," close=")">
                #{imageId}
            </foreach>
            </script>
            """)
    int markVisibleDeletedByUserIdAndIds(
            @Param("userId") long userId,
            @Param("imageIds") List<Long> imageIds,
            @Param("deletedAt") Instant deletedAt);
}
