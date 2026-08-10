package com.superz.aivista.generation.dto;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 个人资产列表查询的内部数据行，不作为 HTTP 响应直接暴露。 */
@Getter
@Setter
@NoArgsConstructor
public class GenerationAssetImageRow {
    private Long imageId;
    private String objectKey;
    private Integer width;
    private Integer height;
    private Instant createdAt;
    private Boolean favorited;
    private String finalPrompt;
    private String finalNegativePrompt;
    private Integer requestedImageCount;
    private Boolean promptExtend;
    private String publicationReviewStatus;
    private Long publicationVersion;
    private Instant publicAt;
    private String publicationTitle;
    private String publicationDescription;
}
