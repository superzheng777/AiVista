package com.superz.aivista.publication.service;
import com.aliyun.oss.OSS;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import java.time.Clock; import java.time.Instant; import java.util.Date; import java.util.List;
import org.springframework.stereotype.Service;
@Service public class InspirationQueryService {
 private final GenerationImageMapper images; private final OSS oss; private final GenerationOssProperties properties; private final Clock clock;
 public InspirationQueryService(GenerationImageMapper images, OSS oss, GenerationOssProperties properties, Clock clock){this.images=images;this.oss=oss;this.properties=properties;this.clock=clock;}
 public List<GenerationAssetImageResponse> list(){ return response(images.selectPublished(36), false); }
 public List<GenerationAssetImageResponse> listByUserId(long userId){ return response(images.selectPublishedByUserId(userId), true); }
 private List<GenerationAssetImageResponse> response(List<GenerationImage> images, boolean includeFavorite){ Instant expires=clock.instant().plus(properties.signedUrlTtl()); return images.stream().map(i->new GenerationAssetImageResponse(String.valueOf(i.getId()),oss.generatePresignedUrl(properties.bucket(),i.getObjectKey(),Date.from(expires)).toString(),expires,i.getCreatedAt(),includeFavorite && Boolean.TRUE.equals(i.getFavorited()),i.getPublicationPrompt(),i.getPublicationNegativePrompt(),new GenerationAssetImageResponse.GenerationConfig(i.getWidth(),i.getHeight(),i.getPublicationRequestedImageCount(),Boolean.TRUE.equals(i.getPublicationPromptExtend())),i.getPublicationReviewStatus() == null ? "NONE" : i.getPublicationReviewStatus(),i.getPublicationVersion() == null ? 0L : i.getPublicationVersion(),i.getPublicAt(),i.getPublicationTitle(),i.getPublicationDescription())).toList(); }
}
