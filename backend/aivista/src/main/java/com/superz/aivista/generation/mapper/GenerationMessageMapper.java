package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.GenerationMessage;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 生成会话消息数据访问接口。 */
public interface GenerationMessageMapper extends BaseMapper<GenerationMessage> {

    @Select("""
            SELECT id, session_id, sequence_no, prompt, negative_prompt, created_at
            FROM generation_messages
            WHERE session_id = #{sessionId}
            ORDER BY sequence_no DESC
            LIMIT #{limit}
            """)
    List<GenerationMessage> selectRecentBySessionId(
            @Param("sessionId") long sessionId,
            @Param("limit") int limit);

    @Select("""
            SELECT id, session_id, sequence_no, prompt, negative_prompt, created_at
            FROM generation_messages
            WHERE session_id = #{sessionId}
              AND (#{beforeSequenceNo} IS NULL OR sequence_no < #{beforeSequenceNo})
            ORDER BY sequence_no DESC
            LIMIT #{limit}
            """)
    List<GenerationMessage> selectPageBySessionId(
            @Param("sessionId") long sessionId,
            @Param("beforeSequenceNo") Integer beforeSequenceNo,
            @Param("limit") int limit);

    @Select("""
            SELECT sequence_no
            FROM generation_messages
            WHERE session_id = #{sessionId}
            ORDER BY sequence_no DESC
            LIMIT 1
            FOR UPDATE
            """)
    Integer selectLastSequenceNoForUpdate(@Param("sessionId") long sessionId);
}
