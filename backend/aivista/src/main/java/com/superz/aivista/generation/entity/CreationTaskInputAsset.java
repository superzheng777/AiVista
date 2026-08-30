package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 用户在一次创作轮次中提交的候选图片。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "creation_task_input_assets", mapperGenerateEnable = false)
public class CreationTaskInputAsset {
    private Long creationTaskId;
    private Long imageAssetId;
    private Integer sourceIndex;
    private Instant createdAt;
}
