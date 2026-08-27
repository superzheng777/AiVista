package com.superz.aivista.publication.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 图片资产的公开发布、审核与互动汇总状态。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "image_publications", mapperGenerateEnable = false)
public class ImagePublication {
    @Id
    private Long assetId;
    private String reviewStatus;
    private Long publicationVersion;
    private Integer reviewAttemptCount;
    private Instant reviewStartedAt;
    private String title;
    private String description;
    private Instant publicAt;
    private Long likeCount;
}
