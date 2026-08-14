package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.aliyun.oss.model.ObjectMetadata;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.List;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Service;

/** 下载百炼临时 PNG 并转存至私有 OSS，不向数据库写入半成品记录。 */
@Service
public class GenerationImageTransferService {
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};

    private final OSS ossClient;
    private final GenerationOssProperties properties;

    /** 注入项目私有 Bucket 的 OSS 客户端和转存安全限制。 */
    public GenerationImageTransferService(OSS generationOssClient, GenerationOssProperties properties) {
        this.ossClient = generationOssClient;
        this.properties = properties;
    }

    /** 逐张转存；单张失败会被记录为缺失结果，允许任务收敛为部分成功。 */
    public List<TransferredImage> transfer(GenerationTask task, List<String> urls) {
        List<TransferredImage> result = new ArrayList<>();
        for (int index = 0; index < urls.size(); index++) {
            try {
                ImageBytes image = downloadPng(urls.get(index));
                String objectKey = properties.objectPrefix() + "/" + task.getUserId()
                        + "/tasks/" + task.getId() + "/" + index + ".png";
                ObjectMetadata metadata = new ObjectMetadata();
                metadata.setContentType("image/png");
                metadata.setContentLength(image.bytes().length);
                metadata.setCacheControl("private, max-age=" + properties.signedUrlTtl().toSeconds());
                ossClient.putObject(properties.bucket(), objectKey, new ByteArrayInputStream(image.bytes()), metadata);
                result.add(new TransferredImage(index, objectKey, image.bytes().length,
                        image.image().getWidth(), image.image().getHeight()));
            } catch (Exception ignored) {
                // 单张转存失败不阻断其他图片；终态由调用方按成功数量收敛。
            }
        }
        return result;
    }

    /** 尽力删除因取消或终态竞争而未写入数据库的对象；失败由后续孤儿清理兜底。 */
    public void deleteTransferred(List<TransferredImage> images) {
        for (TransferredImage image : images) {
            try {
                ossClient.deleteObject(properties.bucket(), image.objectKey());
            } catch (Exception ignored) {
                // 外部删除失败不改变任务终态；后续孤儿对象清理负责兜底。
            }
        }
    }

    /** 下载并校验单张服务商临时图片，返回已限制大小的 PNG 字节和实际尺寸。 */
    private ImageBytes downloadPng(String url) throws Exception {
        URI uri = URI.create(url);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("Provider image URL must use HTTPS");
        }
        URLConnection connection = uri.toURL().openConnection();
        connection.setConnectTimeout((int) properties.connectTimeout().toMillis());
        connection.setReadTimeout((int) properties.readTimeout().toMillis());
        if (!"image/png".equalsIgnoreCase(connection.getContentType())) {
            throw new IllegalArgumentException("Provider image content type must be image/png");
        }
        byte[] bytes;
        try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (output.size() + read > properties.maxObjectSizeBytes()) {
                    throw new IllegalArgumentException("Provider image exceeds the configured size limit");
                }
                output.write(buffer, 0, read);
            }
            bytes = output.toByteArray();
        }
        if (bytes.length > properties.maxObjectSizeBytes() || !hasPngSignature(bytes)) {
            throw new IllegalArgumentException("Provider image is not an accepted PNG");
        }
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
        if (image == null) {
            throw new IllegalArgumentException("Provider image cannot be decoded as PNG");
        }
        return new ImageBytes(bytes, image);
    }

    /** 检查 PNG 固定文件魔数，避免仅信任 HTTP Content-Type。 */
    private static boolean hasPngSignature(byte[] bytes) {
        if (bytes.length < PNG_SIGNATURE.length) {
            return false;
        }
        for (int index = 0; index < PNG_SIGNATURE.length; index++) {
            if (bytes[index] != PNG_SIGNATURE[index]) {
                return false;
            }
        }
        return true;
    }

    public record TransferredImage(int sourceIndex, String objectKey, long fileSize, int width, int height) {
    }

    private record ImageBytes(byte[] bytes, BufferedImage image) {
    }
}
