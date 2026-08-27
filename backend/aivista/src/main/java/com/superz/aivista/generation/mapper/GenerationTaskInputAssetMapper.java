package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.GenerationTaskInputAsset;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface GenerationTaskInputAssetMapper extends BaseMapper<GenerationTaskInputAsset> {
    @Select("SELECT * FROM generation_task_input_assets WHERE task_id = #{taskId} ORDER BY source_index ASC")
    List<GenerationTaskInputAsset> selectByTaskId(@Param("taskId") long taskId);
}
