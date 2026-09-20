package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.CreationActivity;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface CreationActivityMapper extends BaseMapper<CreationActivity> {
    @Select("""
            SELECT COALESCE(MAX(sequence_no), 0)
            FROM creation_activities
            WHERE creation_task_id = #{creationTaskId}
            """)
    int selectMaxSequenceNo(@Param("creationTaskId") long creationTaskId);

    @Select("""
            <script>
            SELECT id, creation_task_id, sequence_no, activity_type, outcome,
                   content, tool_name, generation_task_id, started_at, completed_at
            FROM creation_activities
            WHERE creation_task_id IN
            <foreach collection="creationTaskIds" item="creationTaskId" open="(" separator="," close=")">
                #{creationTaskId}
            </foreach>
            ORDER BY creation_task_id, sequence_no
            </script>
            """)
    List<CreationActivity> selectByCreationTaskIds(@Param("creationTaskIds") List<Long> creationTaskIds);
}
