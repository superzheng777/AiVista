package com.superz.aivista.generation.mapper;

import java.time.Instant;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** Stores the single authoritative Pi context snapshot for each Agent conversation. */
public interface AgentSessionContextMapper {

    @Select("SELECT context_json FROM agent_session_contexts WHERE session_id = #{sessionId} LIMIT 1")
    String selectContextJson(@Param("sessionId") long sessionId);

    @Insert("""
            INSERT INTO agent_session_contexts (session_id, context_json, updated_at)
            VALUES (#{sessionId}, CAST(#{contextJson} AS JSON), #{updatedAt})
            ON DUPLICATE KEY UPDATE context_json = VALUES(context_json), updated_at = VALUES(updated_at)
            """)
    int upsert(@Param("sessionId") long sessionId,
            @Param("contextJson") String contextJson,
            @Param("updatedAt") Instant updatedAt);
}
