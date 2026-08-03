package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.GenerationTask;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 生成任务数据访问接口。条件更新将在任务创建闭环阶段补充。 */
public interface GenerationTaskMapper extends BaseMapper<GenerationTask> {

    @Select("""
            SELECT id, user_id, session_id, source_message_id, model, status, task_version,
                   attempt_count, provider_call_started_at, final_prompt, final_negative_prompt,
                   width, height, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, provider_result_snapshot, idempotency_key, request_fingerprint,
                   failure_code, created_at, updated_at, started_at, completed_at
            FROM generation_tasks
            WHERE user_id = #{userId} AND idempotency_key = #{idempotencyKey}
            LIMIT 1
            """)
    GenerationTask selectByUserIdAndIdempotencyKey(
            @Param("userId") long userId,
            @Param("idempotencyKey") String idempotencyKey);

    @Select("""
            SELECT id, user_id, session_id, source_message_id, model, status, task_version,
                   attempt_count, provider_call_started_at, final_prompt, final_negative_prompt,
                   width, height, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, provider_result_snapshot, idempotency_key, request_fingerprint,
                   failure_code, created_at, updated_at, started_at, completed_at
            FROM generation_tasks
            WHERE id = #{taskId} AND user_id = #{userId}
            LIMIT 1
            """)
    GenerationTask selectOwnedById(@Param("userId") long userId, @Param("taskId") long taskId);

    @Select("""
            SELECT id, user_id, session_id, source_message_id, model, status, task_version,
                   attempt_count, provider_call_started_at, final_prompt, final_negative_prompt,
                   width, height, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, provider_result_snapshot, idempotency_key, request_fingerprint,
                   failure_code, created_at, updated_at, started_at, completed_at
            FROM generation_tasks
            WHERE id = #{taskId} AND user_id = #{userId}
            FOR UPDATE
            """)
    GenerationTask selectOwnedByIdForUpdate(@Param("userId") long userId, @Param("taskId") long taskId);

    @Select("""
            SELECT id, user_id, session_id, status, task_version
            FROM generation_tasks
            WHERE id = #{taskId}
            LIMIT 1
            """)
    GenerationTask selectStatusEventTaskById(@Param("taskId") long taskId);

    @Select("""
            <script>
            SELECT id, session_id, status, task_version
            FROM (
                SELECT id, session_id, status, task_version,
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
            SELECT id, user_id, session_id, source_message_id, model, status, task_version,
                   attempt_count, provider_call_started_at, final_prompt, final_negative_prompt,
                   width, height, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, provider_result_snapshot, idempotency_key, request_fingerprint,
                   failure_code, created_at, updated_at, started_at, completed_at
            FROM generation_tasks
            WHERE source_message_id IN
            <foreach collection="messageIds" item="messageId" open="(" separator="," close=")">
                #{messageId}
            </foreach>
            </script>
            """)
    List<GenerationTask> selectBySourceMessageIds(@Param("messageIds") List<Long> messageIds);

    @Select("""
            SELECT COUNT(*)
            FROM generation_tasks
            WHERE user_id = #{userId}
              AND status IN ('QUEUED', 'RUNNING')
            """)
    int countActiveByUserId(@Param("userId") long userId);

    @Select("""
            SELECT COUNT(*)
            FROM generation_tasks
            WHERE session_id = #{sessionId}
              AND status IN ('QUEUED', 'RUNNING')
            """)
    int countActiveBySessionId(@Param("sessionId") long sessionId);

    @Select("""
            SELECT id, user_id, session_id, source_message_id, model, status, task_version,
                   attempt_count, provider_call_started_at, final_prompt, final_negative_prompt,
                   width, height, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, provider_result_snapshot, idempotency_key, request_fingerprint,
                   failure_code, created_at, updated_at, started_at, completed_at
            FROM generation_tasks
            WHERE user_id = #{userId} AND status IN ('QUEUED', 'RUNNING')
            ORDER BY created_at, id
            """)
    List<GenerationTask> selectActiveOwnedByUserId(@Param("userId") long userId);

    @Select("""
            SELECT id, user_id, session_id, source_message_id, model, status, task_version,
                   attempt_count, provider_call_started_at, final_prompt, final_negative_prompt,
                   width, height, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, provider_result_snapshot, idempotency_key, request_fingerprint,
                   failure_code, created_at, updated_at, started_at, completed_at
            FROM generation_tasks
            WHERE id = #{taskId}
            FOR UPDATE
            """)
    GenerationTask selectByIdForUpdate(@Param("taskId") long taskId);

    @Select("""
            SELECT id, user_id, session_id, source_message_id, model, status, task_version,
                   attempt_count, provider_call_started_at, final_prompt, final_negative_prompt,
                   width, height, requested_image_count, completed_image_count, quota_refunded_at,
                   provider_request_id, provider_result_snapshot, idempotency_key, request_fingerprint,
                   failure_code, created_at, updated_at, started_at, completed_at
            FROM generation_tasks
            WHERE status = 'QUEUED' AND updated_at < #{before}
            ORDER BY updated_at, id
            LIMIT #{limit}
            """)
    List<GenerationTask> selectQueuedBefore(@Param("before") Instant before, @Param("limit") int limit);

    @Update("""
            UPDATE generation_tasks
            SET status = 'FAILED', failure_code = #{failureCode}, task_version = task_version + 1,
                quota_refunded_at = #{quotaRefundedAt}, completed_at = #{completedAt}, updated_at = #{completedAt}
            WHERE id = #{taskId} AND status = 'QUEUED' AND task_version = #{taskVersion}
            """)
    int failQueued(@Param("taskId") long taskId, @Param("taskVersion") int taskVersion,
            @Param("failureCode") String failureCode, @Param("quotaRefundedAt") Instant quotaRefundedAt,
            @Param("completedAt") Instant completedAt);

    @Update("""
            UPDATE generation_tasks
            SET status = 'RUNNING', task_version = task_version + 1, started_at = #{now}, updated_at = #{now}
            WHERE id = #{taskId} AND status = 'QUEUED' AND task_version = #{taskVersion}
            """)
    int claimQueuedForExecution(@Param("taskId") long taskId, @Param("taskVersion") int taskVersion,
            @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET provider_call_started_at = #{now}, updated_at = #{now}
            WHERE id = #{taskId} AND status = 'RUNNING' AND provider_call_started_at IS NULL
            """)
    int markProviderCallStarted(@Param("taskId") long taskId, @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET status = 'QUEUED', task_version = task_version + 1, attempt_count = attempt_count + 1,
                provider_call_started_at = NULL, updated_at = #{now}
            WHERE id = #{taskId} AND status = 'RUNNING' AND task_version = #{taskVersion}
            """)
    int requeueRunningForRetry(@Param("taskId") long taskId, @Param("taskVersion") int taskVersion,
            @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET provider_request_id = #{providerRequestId}, provider_result_snapshot = CAST(#{snapshot} AS JSON),
                updated_at = #{now}
            WHERE id = #{taskId} AND status = 'RUNNING'
            """)
    int saveProviderResult(@Param("taskId") long taskId, @Param("providerRequestId") String providerRequestId,
            @Param("snapshot") String snapshot, @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET status = 'CANCELLED', task_version = task_version + 1,
                quota_refunded_at = COALESCE(#{quotaRefundedAt}, quota_refunded_at),
                provider_result_snapshot = NULL,
                completed_at = #{now}, updated_at = #{now}
            WHERE id = #{taskId} AND status = #{status} AND task_version = #{taskVersion}
            """)
    int cancelActive(@Param("taskId") long taskId, @Param("status") String status,
            @Param("taskVersion") int taskVersion, @Param("quotaRefundedAt") Instant quotaRefundedAt,
            @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET provider_request_id = #{providerRequestId}, updated_at = #{now}
            WHERE id = #{taskId} AND status = 'RUNNING'
            """)
    int saveProviderRequestId(@Param("taskId") long taskId, @Param("providerRequestId") String providerRequestId,
            @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET status = #{status}, task_version = task_version + 1, completed_image_count = #{completedImageCount},
                failure_code = #{failureCode}, provider_result_snapshot = NULL, completed_at = #{now}, updated_at = #{now}
            WHERE id = #{taskId} AND status = 'RUNNING'
            """)
    int completeRunning(@Param("taskId") long taskId, @Param("status") String status,
            @Param("completedImageCount") int completedImageCount, @Param("failureCode") String failureCode,
            @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET status = 'FAILED', task_version = task_version + 1, failure_code = #{failureCode},
                quota_refunded_at = COALESCE(#{quotaRefundedAt}, quota_refunded_at), completed_at = #{now}, updated_at = #{now}
            WHERE id = #{taskId} AND status = 'RUNNING'
            """)
    int failRunning(@Param("taskId") long taskId, @Param("failureCode") String failureCode,
            @Param("quotaRefundedAt") Instant quotaRefundedAt, @Param("now") Instant now);

    @Update("""
            UPDATE generation_tasks
            SET status = 'FAILED', task_version = task_version + 1, failure_code = #{failureCode},
                quota_refunded_at = COALESCE(#{quotaRefundedAt}, quota_refunded_at), completed_at = #{now}, updated_at = #{now}
            WHERE id = #{taskId} AND status = 'RUNNING' AND provider_call_started_at IS NULL
            """)
    int failRunningBeforeProviderCall(@Param("taskId") long taskId, @Param("failureCode") String failureCode,
            @Param("quotaRefundedAt") Instant quotaRefundedAt, @Param("now") Instant now);
}
