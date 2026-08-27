package com.superz.aivista.publication.entity;

import com.mybatisflex.annotation.Column;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Table(value = "image_asset_likes", mapperGenerateEnable = false)
public class ImageAssetLike {
    private Long userId;
    private Long assetId;
    private Long publicationVersion;
    private Instant likedAt;
}
