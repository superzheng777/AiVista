package com.superz.aivista.publication.service;
import com.aliyun.oss.OSS;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.publication.dto.InspirationImageResponse;
import java.time.Clock; import java.time.Instant; import java.util.Date; import java.util.List;
import org.springframework.stereotype.Service;
@Service public class InspirationQueryService {
 private final GenerationImageMapper images; private final OSS oss; private final GenerationOssProperties properties; private final Clock clock;
 public InspirationQueryService(GenerationImageMapper images, OSS oss, GenerationOssProperties properties, Clock clock){this.images=images;this.oss=oss;this.properties=properties;this.clock=clock;}
 public List<InspirationImageResponse> list(){ return response(images.selectPublished(36)); }
 public List<InspirationImageResponse> listByUserId(long userId){ return response(images.selectPublishedByUserId(userId)); }
 private List<InspirationImageResponse> response(List<GenerationImage> images){ Instant expires=clock.instant().plus(properties.signedUrlTtl()); return images.stream().map(i->new InspirationImageResponse(String.valueOf(i.getId()),oss.generatePresignedUrl(properties.bucket(),i.getObjectKey(),Date.from(expires)).toString(),expires,i.getWidth(),i.getHeight(),i.getPublicAt(),i.getPublicationTitle(),i.getPublicationDescription(),i.getPublicationPrompt(),i.getPublicationNegativePrompt(),i.getPublicationRequestedImageCount(),Boolean.TRUE.equals(i.getPublicationPromptExtend()))).toList(); }
}
