package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.aliyun.oss.model.ObjectMetadata;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationAssetUploadProperties;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.dto.UploadedImageAssetResponse;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** Stores a short-lived private image that can be selected as an I2I input. */
@Service
public class ImageAssetUploadService {
    private static final Set<String> CONTENT_TYPES = Set.of("image/png", "image/jpeg");
    private final ImageAssetMapper assets;
    private final OSS oss;
    private final GenerationOssProperties ossProperties;
    private final GenerationAssetUploadProperties properties;
    private final Clock clock;

    public ImageAssetUploadService(ImageAssetMapper assets, OSS generationOssClient, GenerationOssProperties ossProperties,
            GenerationAssetUploadProperties properties, Clock clock) {
        this.assets = assets;
        this.oss = generationOssClient;
        this.ossProperties = ossProperties;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public UploadedImageAssetResponse upload(long userId, MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > properties.maxBytes() || !CONTENT_TYPES.contains(file.getContentType())) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "图片必须是小于限制的 PNG 或 JPEG 文件");
        }
        java.awt.image.BufferedImage image;
        try (InputStream input = file.getInputStream()) {
            image = ImageIO.read(input);
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "无法读取图片文件");
        }
        if (image == null || image.getWidth() < 1 || image.getHeight() < 1) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, "无法读取图片文件");
        }
        Instant now = clock.instant();
        Instant expiresAt = now.plus(properties.temporaryTtl());
        String extension = "image/png".equals(file.getContentType()) ? "png" : "jpg";
        String objectKey = ossProperties.objectPrefix() + "/" + userId + "/uploads/" + UUID.randomUUID() + "/original." + extension;
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentType(file.getContentType());
        metadata.setContentLength(file.getSize());
        metadata.setCacheControl("private, max-age=" + ossProperties.signedUrlTtl().toSeconds());
        try (InputStream input = file.getInputStream()) {
            oss.putObject(ossProperties.bucket(), objectKey, input, metadata);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot store uploaded image asset", exception);
        }
        ImageAsset asset = new ImageAsset();
        asset.setUserId(userId);
        asset.setOrigin("UPLOADED");
        asset.setLifecycle("TEMPORARY");
        asset.setObjectKey(objectKey);
        asset.setOriginalObjectKey(objectKey);
        asset.setContentType(file.getContentType());
        asset.setFileSize(file.getSize());
        asset.setWidth(image.getWidth());
        asset.setHeight(image.getHeight());
        asset.setExpiresAt(expiresAt);
        asset.setOssCleanupStatus("PENDING");
        asset.setOssCleanupAvailableAt(expiresAt);
        asset.setOssCleanupAttemptCount(0);
        asset.setCreatedAt(now);
        assets.insertSelective(asset);
        return new UploadedImageAssetResponse(String.valueOf(asset.getId()), expiresAt);
    }
}
