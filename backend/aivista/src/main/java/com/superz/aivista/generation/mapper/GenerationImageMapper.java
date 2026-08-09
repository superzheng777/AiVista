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

    @Select("SELECT * FROM generation_images WHERE id = #{imageId} AND user_id = #{userId} FOR UPDATE")
    GenerationImage selectOwnedByIdForUpdate(@Param("imageId") long imageId, @Param("userId") long userId);

    @Select("SELECT * FROM generation_images WHERE id = #{imageId}")
    GenerationImage selectByImageId(@Param("imageId") long imageId);

    @Select("SELECT i.*, t.final_prompt AS publication_prompt, t.final_negative_prompt AS publication_negative_prompt, t.requested_image_count AS publication_requested_image_count, t.prompt_extend AS publication_prompt_extend FROM generation_images i INNER JOIN generation_tasks t ON t.id = i.task_id WHERE i.public_at IS NOT NULL AND i.publication_review_status = 'APPROVED' ORDER BY i.public_at DESC, i.id DESC LIMIT #{limit}")
    List<GenerationImage> selectPublished(@Param("limit") int limit);

    @Select("SELECT i.*, t.final_prompt AS publication_prompt, t.final_negative_prompt AS publication_negative_prompt, t.requested_image_count AS publication_requested_image_count, t.prompt_extend AS publication_prompt_extend FROM generation_images i INNER JOIN generation_tasks t ON t.id = i.task_id WHERE i.user_id = #{userId} AND i.public_at IS NOT NULL AND i.publication_review_status = 'APPROVED' ORDER BY i.public_at DESC, i.id DESC")
    List<GenerationImage> selectPublishedByUserId(@Param("userId") long userId);

    @Update("UPDATE generation_images SET publication_review_status = 'PENDING', publication_version = publication_version + 1, publication_review_attempt_count = 0, publication_review_started_at = #{now}, publication_title = #{title}, publication_description = #{description} WHERE id = #{imageId}")
    int markPublicationPending(@Param("imageId") long imageId, @Param("title") String title, @Param("description") String description, @Param("now") Instant now);

    @Update("UPDATE generation_images SET public_at = NULL, publication_review_status = 'NONE', publication_review_started_at = NULL, publication_title = NULL, publication_description = NULL, oss_cleanup_status = IF(deleted_at IS NOT NULL, 'PENDING', oss_cleanup_status), oss_cleanup_available_at = IF(deleted_at IS NOT NULL, #{now}, oss_cleanup_available_at) WHERE id = #{imageId}")
    int withdrawPublication(@Param("imageId") long imageId, @Param("now") Instant now);

    @Update("UPDATE generation_images SET public_at = #{now}, publication_review_status = 'APPROVED', publication_review_started_at = NULL WHERE id = #{imageId} AND publication_version = #{version} AND publication_review_status = 'PENDING'")
    int approvePublication(@Param("imageId") long imageId, @Param("version") long version, @Param("now") Instant now);

    @Update("UPDATE generation_images SET publication_review_status = 'REJECTED', publication_review_started_at = NULL, oss_cleanup_status = IF(deleted_at IS NOT NULL, 'PENDING', oss_cleanup_status), oss_cleanup_available_at = IF(deleted_at IS NOT NULL, #{now}, oss_cleanup_available_at) WHERE id = #{imageId} AND publication_version = #{version} AND publication_review_status = 'PENDING'")
    int rejectPublication(@Param("imageId") long imageId, @Param("version") long version, @Param("now") Instant now);

    @Update("UPDATE generation_images SET publication_review_attempt_count = publication_review_attempt_count + 1 WHERE id = #{imageId} AND publication_version = #{version} AND publication_review_status = 'PENDING'")
    int incrementPublicationReviewAttemptCount(@Param("imageId") long imageId, @Param("version") long version);

    @Update("UPDATE generation_images SET publication_review_status = 'FAILED', publication_review_started_at = NULL, oss_cleanup_status = IF(deleted_at IS NOT NULL, 'PENDING', oss_cleanup_status), oss_cleanup_available_at = IF(deleted_at IS NOT NULL, #{now}, oss_cleanup_available_at) WHERE id = #{imageId} AND publication_version = #{version} AND publication_review_status = 'PENDING'")
    int failPublication(@Param("imageId") long imageId, @Param("version") long version, @Param("now") Instant now);

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
                   t.final_prompt, t.final_negative_prompt, t.requested_image_count
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

    @Select("""
            SELECT i.id AS image_id, i.object_key, i.width, i.height, i.created_at,
                   t.final_prompt, t.final_negative_prompt, t.requested_image_count
            FROM generation_images i
            INNER JOIN generation_tasks t ON t.id = i.task_id
            WHERE i.id = #{imageId}
              AND i.user_id = #{userId}
              AND i.deleted_at IS NULL
            """)
    GenerationAssetImageRow selectVisibleByUserIdAndId(
            @Param("userId") long userId, @Param("imageId") long imageId);

    @Update("""
            <script>
            UPDATE generation_images
            SET deleted_at = #{deletedAt},
                oss_cleanup_status = IF(public_at IS NULL AND publication_review_status &lt;&gt; 'PENDING', 'PENDING', oss_cleanup_status),
                oss_cleanup_attempt_count = IF(public_at IS NULL AND publication_review_status &lt;&gt; 'PENDING', 0, oss_cleanup_attempt_count),
                oss_cleanup_available_at = IF(public_at IS NULL AND publication_review_status &lt;&gt; 'PENDING', #{deletedAt}, oss_cleanup_available_at),
                oss_cleanup_last_error = IF(public_at IS NULL AND publication_review_status &lt;&gt; 'PENDING', NULL, oss_cleanup_last_error)
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

    @Select("""
            SELECT id, object_key, oss_cleanup_attempt_count
            FROM generation_images
            WHERE oss_cleanup_status = 'PENDING'
              AND oss_cleanup_available_at <= #{availableAt}
              AND public_at IS NULL
              AND publication_review_status <> 'PENDING'
            ORDER BY oss_cleanup_available_at ASC, id ASC
            LIMIT #{limit}
            """)
    List<GenerationImage> selectPendingOssCleanup(
            @Param("availableAt") Instant availableAt, @Param("limit") int limit);

    @Update("""
            UPDATE generation_images
            SET oss_cleanup_status = 'SUCCEEDED',
                oss_cleanup_available_at = NULL,
                oss_cleanup_last_error = NULL
            WHERE id = #{imageId}
              AND oss_cleanup_status = 'PENDING'
            """)
    int markOssCleanupSucceeded(@Param("imageId") long imageId);

    @Update("""
            UPDATE generation_images
            SET oss_cleanup_attempt_count = oss_cleanup_attempt_count + 1,
                oss_cleanup_available_at = #{availableAt},
                oss_cleanup_last_error = #{lastError}
            WHERE id = #{imageId}
              AND oss_cleanup_status = 'PENDING'
            """)
    int rescheduleOssCleanup(@Param("imageId") long imageId,
            @Param("availableAt") Instant availableAt, @Param("lastError") String lastError);
}
