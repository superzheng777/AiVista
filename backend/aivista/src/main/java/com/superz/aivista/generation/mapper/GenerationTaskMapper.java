package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.GenerationTask;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 生成任务数据访问接口，包含各阶段的条件状态迁移与超时扫描。 */
public interface GenerationTaskMapper extends BaseMapper<GenerationTask> {

    @Select("""
            SELECT id, user_id, session_id, creation_task_id, tool_call_id, operation, model, status,
                   revision, attempt_count, final_prompt, final_negative_prompt, width, height,
                   prompt_extend, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, failure_code, created_at, updated_at, completed_at
            FROM generation_tasks
            WHERE creation_task_id = #{creationTaskId} AND tool_call_id = #{toolCallId}
            FOR UPDATE
            """)
    GenerationTask selectByCreationTaskIdAndToolCallIdForUpdate(
            @Param("creationTaskId") long creationTaskId,
            @Param("toolCallId") String toolCallId);

    @Select("SELECT creation_task_id FROM generation_tasks WHERE id = #{taskId} LIMIT 1")
    Long selectCreationTaskId(@Param("taskId") long taskId);

    @Select("""
            SELECT COALESCE(SUM(requested_image_count), 0)
            FROM generation_tasks
            WHERE creation_task_id = #{creationTaskId} AND status <> 'FAILED'
            """)
    int sumEffectiveRequestedImagesByCreationTaskId(@Param("creationTaskId") long creationTaskId);

    @Select("""
            SELECT id, user_id, session_id, creation_task_id, model, status, revision,
                   attempt_count, final_prompt, final_negative_prompt,
                   width, height, prompt_extend, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id,
                   failure_code, created_at, updated_at, completed_at
            FROM generation_tasks
            WHERE id = #{taskId} AND user_id = #{userId}
            LIMIT 1
            """)
    GenerationTask selectOwnedById(@Param("userId") long userId, @Param("taskId") long taskId);

    @Select("""
            SELECT id, user_id, session_id, creation_task_id, model, status, revision,
                   attempt_count, final_prompt, final_negative_prompt,
                   width, height, prompt_extend, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id,
                   failure_code, created_at, updated_at, completed_at
            FROM generation_tasks
            WHERE id = #{taskId} AND user_id = #{userId}
            FOR UPDATE
            """)
    GenerationTask selectOwnedByIdForUpdate(@Param("userId") long userId, @Param("taskId") long taskId);

    @Select("""
            <script>
            SELECT id, user_id, session_id, status, revision
            FROM generation_tasks
            WHERE id IN
            <foreach collection="taskIds" item="taskId" open="(" separator="," close=")">#{taskId}</foreach>
            </script>
            """)
    List<GenerationTask> selectStatusEventTasksByIds(@Param("taskIds") List<Long> taskIds);

    @Select("""
            <script>
            SELECT id, session_id, status, revision
            FROM (
                SELECT id, session_id, status, revision,
                       ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC, id DESC) AS latest_row_num
                FROM generation_tasks
                WHERE session_id IN
                <foreach collection="sessionIds" item="sessionId" open="(" separator="," close=")">
                    #{sessionId}
                </foreach>
            ) latest_tasks
            WHERE latest_row_num = 1
            </script>
            """)
    List<GenerationTask> selectLatestBySessionIds(@Param("sessionIds") List<Long> sessionIds);

    @Select("""
            <script>
            SELECT DISTINCT session_id
            FROM generation_tasks
            WHERE status IN ('QUEUED', 'GENERATING', 'SAVING')
              AND session_id IN
            <foreach collection="sessionIds" item="sessionId" open="(" separator="," close=")">#{sessionId}</foreach>
            </script>
            """)
    List<Long> selectActiveSessionIds(@Param("sessionIds") List<Long> sessionIds);

    @Select("""
            <script>
            SELECT id, user_id, session_id, creation_task_id, model, status, revision,
                   attempt_count, final_prompt, final_negative_prompt,
                   width, height, prompt_extend, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id,
                   failure_code, created_at, updated_at, completed_at
            FROM generation_tasks
            WHERE creation_task_id IN
            <foreach collection="creationTaskIds" item="creationTaskId" open="(" separator="," close=")">
                #{creationTaskId}
            </foreach>
            ORDER BY creation_task_id, created_at, id
            </script>
            """)
    List<GenerationTask> selectByCreationTaskIds(@Param("creationTaskIds") List<Long> creationTaskIds);

    @Select("""
            SELECT COUNT(*)
            FROM generation_tasks
            WHERE user_id = #{userId}
              AND status IN ('QUEUED', 'GENERATING', 'SAVING')
            """)
    int countActiveByUserId(@Param("userId") long userId);

    @Select("""
            SELECT COUNT(*)
            FROM generation_tasks
            WHERE session_id = #{sessionId}
              AND status IN ('QUEUED', 'GENERATING', 'SAVING')
            """)
    int countActiveBySessionId(@Param("sessionId") long sessionId);

    @Select("""
            SELECT id, user_id, session_id, creation_task_id, model, status, revision,
                   attempt_count, final_prompt, final_negative_prompt,
                   width, height, prompt_extend, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id,
                   failure_code, created_at, updated_at, completed_at
            FROM generation_tasks
            WHERE id = #{taskId}
            FOR UPDATE
            """)
    GenerationTask selectByIdForUpdate(@Param("taskId") long taskId);

    @Select("""
            SELECT id, user_id, session_id, creation_task_id, model, status, revision,
                   attempt_count, final_prompt, final_negative_prompt,
                   width, height, prompt_extend, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, failure_code, created_at, updated_at, completed_at
            FROM generation_tasks WHERE id = #{taskId} LIMIT 1
            """)
    GenerationTask selectTaskById(@Param("taskId") long taskId);

    @Update("""
            UPDATE generation_tasks
            SET status = #{nextStatus}, revision = revision + 1, updated_at = #{now}
            WHERE id = #{taskId} AND status = #{currentStatus} AND revision = #{revision}
            """)
    int advancePhase(@Param("taskId") long taskId, @Param("currentStatus") String currentStatus,
            @Param("revision") int revision, @Param("nextStatus") String nextStatus,
            @Param("now") Instant now);

    @Select("""
            SELECT id, user_id, session_id, creation_task_id, model, status, revision,
                   attempt_count, final_prompt, final_negative_prompt,
                   width, height, prompt_extend, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id,
                   failure_code, created_at, updated_at, completed_at
            FROM generation_tasks
            WHERE status = 'QUEUED' AND updated_at < #{before}
            ORDER BY updated_at, id
            LIMIT #{limit}
            """)
    List<GenerationTask> selectQueuedBefore(@Param("before") Instant before, @Param("limit") int limit);

    @Update("""
            UPDATE generation_tasks
            SET status = 'FAILED', failure_code = #{failureCode}, revision = revision + 1,
                quota_refunded_at = #{quotaRefundedAt}, completed_at = #{completedAt}, updated_at = #{completedAt}
            WHERE id = #{taskId} AND status IN ('QUEUED', 'GENERATING', 'SAVING')
              AND revision = #{revision}
            """)
    int failQueued(@Param("taskId") long taskId, @Param("revision") int revision,
            @Param("failureCode") String failureCode, @Param("quotaRefundedAt") Instant quotaRefundedAt,
            @Param("completedAt") Instant completedAt);

    @Update("""
            UPDATE generation_tasks
            SET status = #{status}, revision = revision + 1, completed_image_count = #{completedImageCount},
                failure_code = #{failureCode}, provider_request_id = #{providerRequestId},
                completed_at = #{now}, updated_at = #{now}
            WHERE id = #{taskId} AND status IN ('QUEUED', 'GENERATING', 'SAVING')
              AND revision = #{revision}
            """)
    int completeActivePipeline(@Param("taskId") long taskId, @Param("revision") int revision,
            @Param("status") String status, @Param("completedImageCount") int completedImageCount,
            @Param("failureCode") String failureCode, @Param("providerRequestId") String providerRequestId,
            @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET status = 'FAILED', revision = revision + 1, failure_code = #{failureCode},
                provider_request_id = #{providerRequestId},
                quota_refunded_at = COALESCE(#{quotaRefundedAt}, quota_refunded_at),
                completed_at = #{now}, updated_at = #{now}
            WHERE id = #{taskId} AND status = 'QUEUED' AND revision = #{revision}
            """)
    int failActivePipeline(@Param("taskId") long taskId, @Param("revision") int revision,
            @Param("failureCode") String failureCode, @Param("providerRequestId") String providerRequestId,
            @Param("quotaRefundedAt") Instant quotaRefundedAt, @Param("now") Instant now);

}
