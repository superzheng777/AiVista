package com.superz.aivista.generation.mapper;

import com.superz.aivista.generation.entity.AgentSessionContext;
import java.time.Instant;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** Stores the single authoritative Pi context snapshot for each Agent conversation. */
public interface AgentSessionContextMapper {

    @Select("""
            SELECT session_id, context_json, snapshot_creation_task_id, snapshot_revision,
                   pending_tool_call_id, pending_input_status, updated_at
            FROM agent_session_contexts
            WHERE session_id = #{sessionId}
            LIMIT 1
            """)
    AgentSessionContext selectBySessionId(@Param("sessionId") long sessionId);

    @Insert("""
            INSERT INTO agent_session_contexts
                (session_id, context_json, snapshot_creation_task_id, snapshot_revision,
                 pending_tool_call_id, pending_input_status, updated_at)
            VALUES
                (#{sessionId}, CAST(#{contextJson} AS JSON), #{creationTaskId}, #{revision},
                 #{toolCallId}, 'PENDING', #{updatedAt})
            ON DUPLICATE KEY UPDATE
                context_json = VALUES(context_json),
                snapshot_creation_task_id = VALUES(snapshot_creation_task_id),
                snapshot_revision = VALUES(snapshot_revision),
                pending_tool_call_id = VALUES(pending_tool_call_id),
                pending_input_status = VALUES(pending_input_status),
                updated_at = VALUES(updated_at)
            """)
    int upsertPending(@Param("sessionId") long sessionId,
            @Param("contextJson") String contextJson,
            @Param("creationTaskId") long creationTaskId,
            @Param("revision") long revision,
            @Param("toolCallId") String toolCallId,
            @Param("updatedAt") Instant updatedAt);

    @Update("""
            UPDATE agent_session_contexts
            SET snapshot_revision = #{nextRevision},
                pending_input_status = #{nextStatus},
                updated_at = #{updatedAt}
            WHERE session_id = #{sessionId}
              AND snapshot_creation_task_id = #{creationTaskId}
              AND snapshot_revision = #{expectedRevision}
              AND pending_tool_call_id = #{toolCallId}
              AND pending_input_status = #{expectedStatus}
            """)
    int transitionPending(@Param("sessionId") long sessionId,
            @Param("creationTaskId") long creationTaskId,
            @Param("expectedRevision") long expectedRevision,
            @Param("nextRevision") long nextRevision,
            @Param("toolCallId") String toolCallId,
            @Param("expectedStatus") String expectedStatus,
            @Param("nextStatus") String nextStatus,
            @Param("updatedAt") Instant updatedAt);

    @Insert("""
            INSERT INTO agent_session_contexts
                (session_id, context_json, snapshot_creation_task_id, snapshot_revision,
                 pending_tool_call_id, pending_input_status, updated_at)
            VALUES
                (#{sessionId}, CAST(#{contextJson} AS JSON), #{creationTaskId}, #{revision},
                 NULL, NULL, #{updatedAt})
            ON DUPLICATE KEY UPDATE
                context_json = VALUES(context_json),
                snapshot_creation_task_id = VALUES(snapshot_creation_task_id),
                snapshot_revision = VALUES(snapshot_revision),
                pending_tool_call_id = NULL,
                pending_input_status = NULL,
                updated_at = VALUES(updated_at)
            """)
    int upsertCompleted(@Param("sessionId") long sessionId,
            @Param("contextJson") String contextJson,
            @Param("creationTaskId") long creationTaskId,
            @Param("revision") long revision,
            @Param("updatedAt") Instant updatedAt);
}
