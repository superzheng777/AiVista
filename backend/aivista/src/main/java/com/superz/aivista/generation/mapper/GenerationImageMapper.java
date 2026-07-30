package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.GenerationImage;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 生成结果图片数据访问接口。 */
public interface GenerationImageMapper extends BaseMapper<GenerationImage> {

    @Select("""
            SELECT id, task_id, user_id, object_key, content_type, file_size, width, height, source_index, created_at
            FROM generation_images
            WHERE task_id = #{taskId}
            ORDER BY source_index ASC
            """)
    List<GenerationImage> selectByTaskId(@Param("taskId") long taskId);

    @Select("""
            <script>
            SELECT id, task_id, user_id, object_key, content_type, file_size, width, height, source_index, created_at
            FROM generation_images
            WHERE task_id IN
            <foreach collection="taskIds" item="taskId" open="(" separator="," close=")">
                #{taskId}
            </foreach>
            ORDER BY task_id ASC, source_index ASC
            </script>
            """)
    List<GenerationImage> selectByTaskIds(@Param("taskIds") List<Long> taskIds);
}
