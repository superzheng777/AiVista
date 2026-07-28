package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.GenerationTask;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

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
            SELECT COUNT(*)
            FROM generation_tasks
            WHERE user_id = #{userId}
              AND status IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED')
            """)
    int countActiveByUserId(@Param("userId") long userId);

    @Select("""
            SELECT COUNT(*)
            FROM generation_tasks
            WHERE session_id = #{sessionId}
              AND status IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED')
            """)
    int countActiveBySessionId(@Param("sessionId") long sessionId);
}
