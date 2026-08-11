package com.superz.aivista.publication.entity;

import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Table(value = "generation_image_likes", mapperGenerateEnable = false)
public class GenerationImageLike {
    private Long userId;
    private Long imageId;
    private Long publicationVersion;
    private Instant likedAt;
}
