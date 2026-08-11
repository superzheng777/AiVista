package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 已成功转存至私有 OSS 的生成结果图片。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "generation_images", mapperGenerateEnable = false)
public class GenerationImage {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long taskId;
    private Long userId;
    /** 私有 OSS 对象键，不保存或返回短期签名 URL。 */
    private String objectKey;
    private String contentType;
    private Long fileSize;
    private Integer width;
    private Integer height;
    /** 服务商结果内部序号，用于崩溃恢复时避免重复转存。 */
    private Integer sourceIndex;
    /** 用户删除资产的时间；非空时不再签发私有对象访问地址。 */
    private Instant deletedAt;
    private String ossCleanupStatus;
    private Integer ossCleanupAttemptCount;
    private Instant ossCleanupAvailableAt;
    private String ossCleanupLastError;
    private Boolean favorited;
    private Instant publicAt;
    private String publicationReviewStatus;
    private Long publicationVersion;
    private Integer publicationReviewAttemptCount;
    private Instant publicationReviewStartedAt;
    private String publicationTitle;
    private String publicationDescription;
    private Long likeCount;
    private String publicationPrompt;
    private String publicationNegativePrompt;
    private Integer publicationRequestedImageCount;
    private Boolean publicationPromptExtend;
    private Instant createdAt;
}
