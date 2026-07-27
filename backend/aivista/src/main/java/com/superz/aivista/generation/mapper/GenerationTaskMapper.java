package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.GenerationTask;

/** 生成任务数据访问接口。条件更新将在任务创建闭环阶段补充。 */
public interface GenerationTaskMapper extends BaseMapper<GenerationTask> {
}
