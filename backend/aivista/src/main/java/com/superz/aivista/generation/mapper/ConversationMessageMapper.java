package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.ConversationMessage;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 生成会话通用消息数据访问接口。 */
public interface ConversationMessageMapper extends BaseMapper<ConversationMessage> {

    @Select("""
            <script>
            SELECT id, session_id, creation_task_id, sequence_no, role, content, created_at
            FROM conversation_messages
            WHERE creation_task_id IN
            <foreach collection="creationTaskIds" item="creationTaskId" open="(" separator="," close=")">
                #{creationTaskId}
            </foreach>
            ORDER BY sequence_no
            </script>
            """)
    List<ConversationMessage> selectByCreationTaskIds(
            @Param("creationTaskIds") List<Long> creationTaskIds);

    @Select("""
            SELECT sequence_no
            FROM conversation_messages
            WHERE session_id = #{sessionId}
            ORDER BY sequence_no DESC
            LIMIT 1
            FOR UPDATE
            """)
    Integer selectLastSequenceNoForUpdate(@Param("sessionId") long sessionId);
}
