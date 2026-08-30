package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.CreationTask;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 会话创作轮次数据访问接口。 */
public interface CreationTaskMapper extends BaseMapper<CreationTask> {

    @Select("""
            SELECT id, user_id, session_id, mode, created_at, updated_at
            FROM creation_tasks
            WHERE session_id = #{sessionId}
              AND (#{beforeId} IS NULL OR id < #{beforeId})
            ORDER BY id DESC
            LIMIT #{limit}
            """)
    List<CreationTask> selectPageBySessionId(
            @Param("sessionId") long sessionId,
            @Param("beforeId") Long beforeId,
            @Param("limit") int limit);
}
