package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import com.mybatisflex.annotation.Column;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 可作为图生图输入或生成结果展示的私有图片资产。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "image_assets", mapperGenerateEnable = false)
public class ImageAsset {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long userId;
    private String origin;
    private String lifecycle;
    private Long originTaskId;
    private Integer sourceIndex;
    private String objectKey;
    private String originalObjectKey;
    private String contentType;
    private Long fileSize;
    private Integer width;
    private Integer height;
    private Boolean isFavorited;
    private Instant deletedAt;
    private Instant expiresAt;
    private String ossCleanupStatus;
    private Integer ossCleanupAttemptCount;
    private Instant ossCleanupAvailableAt;
    private String ossCleanupLastError;
    private Instant createdAt;
    /** 以下字段仅由资产、发布与任务表的联查填充，不持久化到 image_assets。 */
    @Column(ignore = true)
    private String publicationReviewStatus;
    @Column(ignore = true)
    private Long publicationVersion;
    @Column(ignore = true)
    private Integer publicationReviewAttemptCount;
    @Column(ignore = true)
    private Instant publicationReviewStartedAt;
    @Column(ignore = true)
    private String publicationTitle;
    @Column(ignore = true)
    private String publicationDescription;
    @Column(ignore = true)
    private Instant publicAt;
    @Column(ignore = true)
    private Long likeCount;
    @Column(ignore = true)
    private String publicationPrompt;
    @Column(ignore = true)
    private String publicationNegativePrompt;
    @Column(ignore = true)
    private Integer publicationRequestedImageCount;
    @Column(ignore = true)
    private Boolean publicationPromptExtend;
}
