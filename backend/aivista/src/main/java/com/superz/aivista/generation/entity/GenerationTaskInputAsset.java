package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 某次图生图任务冻结的参考资产及其输入顺序。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "generation_task_input_assets", mapperGenerateEnable = false)
public class GenerationTaskInputAsset {
    private Long taskId;
    private Long assetId;
    private Integer sourceIndex;
    private Instant createdAt;
}
