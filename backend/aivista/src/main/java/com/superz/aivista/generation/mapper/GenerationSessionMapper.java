package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.GenerationSession;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 生成会话数据访问接口。 */
public interface GenerationSessionMapper extends BaseMapper<GenerationSession> {

    @Select("""
            SELECT id, user_id, title, last_message_at, created_at, updated_at
            FROM generation_sessions
            WHERE user_id = #{userId}
              AND (#{cursorLastMessageAt} IS NULL
                   OR last_message_at < #{cursorLastMessageAt}
                   OR (last_message_at = #{cursorLastMessageAt} AND id < #{cursorSessionId}))
            ORDER BY last_message_at DESC, id DESC
            LIMIT #{limit}
            """)
    List<GenerationSession> selectPageByUserId(
            @Param("userId") long userId,
            @Param("cursorLastMessageAt") Instant cursorLastMessageAt,
            @Param("cursorSessionId") Long cursorSessionId,
            @Param("limit") int limit);

    @Select("""
            SELECT id, user_id, title, last_message_at, created_at, updated_at
            FROM generation_sessions
            WHERE id = #{sessionId} AND user_id = #{userId}
            LIMIT 1
            """)
    GenerationSession selectOwnedById(@Param("sessionId") long sessionId, @Param("userId") long userId);

    @Select("""
            SELECT id, user_id, title, last_message_at, created_at, updated_at
            FROM generation_sessions
            WHERE id = #{sessionId} AND user_id = #{userId}
            FOR UPDATE
            """)
    GenerationSession selectOwnedByIdForUpdate(
            @Param("sessionId") long sessionId,
            @Param("userId") long userId);

    @Update("""
            UPDATE generation_sessions
            SET last_message_at = #{lastMessageAt}
            WHERE id = #{sessionId}
            """)
    int updateLastMessageAt(@Param("sessionId") long sessionId,
            @Param("lastMessageAt") java.time.Instant lastMessageAt);
}
