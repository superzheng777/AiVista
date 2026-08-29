package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.aliyun.oss.model.ObjectMetadata;
import com.aliyun.oss.model.ProcessObjectRequest;
import com.superz.aivista.generation.config.GenerationImageTransferProperties;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.model.GenerationImageObjectKeys;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** 将百炼临时图片流式转存至私有 OSS，不向数据库写入半成品记录。 */
@Service
public class GenerationImageTransferService {
    private static final Logger log = LoggerFactory.getLogger(GenerationImageTransferService.class);

    private final OSS ossClient;
    private final GenerationOssProperties ossProperties;
    private final GenerationImageTransferProperties transferProperties;

    /** 注入项目私有 Bucket 的 OSS 客户端和转存网络配置。 */
    public GenerationImageTransferService(OSS generationOssClient, GenerationOssProperties ossProperties,
            GenerationImageTransferProperties transferProperties) {
        this.ossClient = generationOssClient;
        this.ossProperties = ossProperties;
        this.transferProperties = transferProperties;
    }

    /** 逐张转存；单张失败会被记录为缺失结果，允许任务收敛为部分成功。 */
    public List<TransferredImage> transfer(GenerationTask task, List<String> urls) {
        List<TransferredImage> result = new ArrayList<>();
        for (int index = 0; index < urls.size(); index++) {
            try {
                result.add(transferOne(task, index, urls.get(index)));
            } catch (Exception exception) {
                log.warn("Generation image transfer failed for task {} source index {}: {}",
                        task.getId(), index, exception.getClass().getSimpleName());
                // 单张转存失败不阻断其他图片；终态由调用方按成功数量收敛。
            }
        }
        return result;
    }

    /** 将单张服务商临时图片直接流式写入 OSS，只统计已转存字节数。 */
    private TransferredImage transferOne(GenerationTask task, int sourceIndex, String url) throws Exception {
        URI uri = URI.create(url);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("Provider image URL must use HTTPS");
        }
        URLConnection connection = openConnection(uri);
        connection.setConnectTimeout(Math.toIntExact(transferProperties.sourceConnectTimeout().toMillis()));
        connection.setReadTimeout(Math.toIntExact(transferProperties.sourceReadTimeout().toMillis()));
        String objectPrefix = ossProperties.objectPrefix() + "/" + task.getUserId()
                + "/tasks/" + task.getId() + "/" + sourceIndex;
        String originalObjectKey = objectPrefix + "/original.png";
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentType("image/png");
        metadata.setCacheControl("private, max-age=" + ossProperties.signedUrlTtl().toSeconds());
        try (InputStream source = connection.getInputStream(); CountingInputStream input = new CountingInputStream(source)) {
            ossClient.putObject(ossProperties.bucket(), originalObjectKey, input, metadata);
            persistVariant(originalObjectKey, objectPrefix + "/card.webp",
                    "image/resize,l_640/format,webp/quality,Q_80");
            persistVariant(originalObjectKey, objectPrefix + "/display.webp",
                    "image/resize,l_1600/format,webp/quality,Q_85");
            return new TransferredImage(sourceIndex, objectPrefix, input.count(), task.getWidth(), task.getHeight());
        } catch (Exception exception) {
            deleteObjectGroup(objectPrefix);
            throw exception;
        }
    }

    /** 调用 OSS 服务端处理并另存为，不在应用进程中解码或缓存图像像素。 */
    private void persistVariant(String sourceObjectKey, String targetObjectKey, String process) {
        ossClient.processObject(new ProcessObjectRequest(ossProperties.bucket(), sourceObjectKey,
                process + "|sys/saveas,o_" + base64(targetObjectKey) + ",b_" + base64(ossProperties.bucket())));
    }

    private void deleteObjectGroup(String storedKey) {
        GenerationImageObjectKeys keys = GenerationImageObjectKeys.fromStoredValue(storedKey);
        for (String objectKey : List.of(keys.original(), keys.thumbnail(), keys.display()).stream().distinct().toList()) {
            try {
                ossClient.deleteObject(ossProperties.bucket(), objectKey);
            } catch (Exception exception) {
                log.warn("Generation image cleanup failed for object {}: {}", objectKey,
                        exception.getClass().getSimpleName());
            }
        }
    }

    private static String base64(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    public record TransferredImage(int sourceIndex, String objectKey, long fileSize, int width, int height) {
    }

    /** 独立连接创建点便于验证上传前不会预读完整来源内容。 */
    URLConnection openConnection(URI uri) throws IOException {
        return uri.toURL().openConnection();
    }

    /** 透传字节的同时统计 OSS 实际消费的来源数据量，不缓存图片内容。 */
    private static final class CountingInputStream extends FilterInputStream {
        private long count;

        private CountingInputStream(InputStream input) {
            super(input);
        }

        @Override
        public int read() throws IOException {
            int value = super.read();
            if (value != -1) {
                count++;
            }
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws IOException {
            int read = super.read(bytes, offset, length);
            if (read > 0) {
                count += read;
            }
            return read;
        }

        private long count() {
            return count;
        }
    }
}
