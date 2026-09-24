package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.CreationForm;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

public interface CreationFormMapper extends BaseMapper<CreationForm> {
    @Insert("""
            INSERT INTO creation_forms
                (creation_task_id, tool_call_id, status, form_json, requested_at, resolved_at)
            VALUES
                (#{creationTaskId}, #{toolCallId}, #{status}, CAST(#{formJson} AS JSON), #{requestedAt}, NULL)
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertForm(CreationForm form);

    @Select("""
            SELECT id, creation_task_id, tool_call_id, status, form_json, requested_at, resolved_at
            FROM creation_forms
            WHERE creation_task_id = #{creationTaskId} AND tool_call_id = #{toolCallId}
            FOR UPDATE
            """)
    CreationForm selectByToolCallForUpdate(@Param("creationTaskId") long creationTaskId,
            @Param("toolCallId") String toolCallId);

    @Select("""
            SELECT id, creation_task_id, tool_call_id, status, form_json, requested_at, resolved_at
            FROM creation_forms
            WHERE creation_task_id = #{creationTaskId} AND tool_call_id = #{toolCallId}
            LIMIT 1
            """)
    CreationForm selectByToolCall(@Param("creationTaskId") long creationTaskId,
            @Param("toolCallId") String toolCallId);

    @Select("""
            SELECT id, creation_task_id, tool_call_id, status, form_json, requested_at, resolved_at
            FROM creation_forms
            WHERE id = #{formId}
            FOR UPDATE
            """)
    CreationForm selectByIdForUpdate(@Param("formId") long formId);

    @Select("""
            <script>
            SELECT id, creation_task_id, tool_call_id, status, form_json, requested_at, resolved_at
            FROM creation_forms
            WHERE creation_task_id IN
            <foreach collection="creationTaskIds" item="creationTaskId" open="(" separator="," close=")">
                #{creationTaskId}
            </foreach>
            ORDER BY creation_task_id, id
            </script>
            """)
    List<CreationForm> selectByCreationTaskIds(@Param("creationTaskIds") List<Long> creationTaskIds);

    @Update("""
            UPDATE creation_forms
            SET status = #{status},
                form_json = CASE WHEN #{formJson} IS NULL THEN form_json ELSE CAST(#{formJson} AS JSON) END,
                resolved_at = #{resolvedAt}
            WHERE id = #{formId} AND status = 'PENDING'
            """)
    int resolvePending(@Param("formId") long formId, @Param("status") String status,
            @Param("formJson") String formJson, @Param("resolvedAt") Instant resolvedAt);

    @Update("""
            UPDATE creation_forms
            SET status = 'CANCELLED', resolved_at = #{resolvedAt}
            WHERE id = #{formId} AND status = 'PENDING'
            """)
    int cancelPending(@Param("formId") long formId, @Param("resolvedAt") Instant resolvedAt);
}
