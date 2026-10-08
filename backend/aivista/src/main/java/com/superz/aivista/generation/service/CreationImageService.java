package com.superz.aivista.generation.service;

import com.aliyun.oss.OSS;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import java.net.URI;
import java.time.Clock;
import java.util.Date;
import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

@Service
public class CreationImageService {
    public record Reference(String assetId, String url) {}
    private final ImageAssetMapper assets;
    private final OSS oss;
    private final GenerationOssProperties properties;
    private final Clock clock;

    public CreationImageService(ImageAssetMapper assets, OSS oss, GenerationOssProperties properties, Clock clock) {
        this.assets = assets;
        this.oss = oss;
        this.properties = properties;
        this.clock = clock;
    }

    public List<Reference> authorize(long userId, List<String> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        if (ids.size() > 3 || new java.util.HashSet<>(ids).size() != ids.size())
            throw new BusinessException(ErrorCode.VALIDATION_ERROR);
        var normalized = ids.stream().map(id -> {
            try {
                long parsed = Long.parseLong(id);
                if (parsed <= 0 || !Long.toString(parsed).equals(id)) throw new NumberFormatException();
                return parsed;
            } catch (NumberFormatException exception) { throw new BusinessException(ErrorCode.VALIDATION_ERROR); }
        }).toList();
        return normalized.stream().map(id -> {
            var asset = assets.selectVisibleDetailByUserIdAndId(userId, id);
            if (asset == null || asset.getExpiresAt() != null && !asset.getExpiresAt().isAfter(clock.instant())) {
                throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
            }
            return new Reference(id.toString(), unsigned(asset.getOriginalObjectKey()));
        }).toList();
    }

    public String unsigned(String objectKey) {
        return origin() + "/" + objectKey;
    }

    /** Only asset arrays in the structured display contract are signed, never arbitrary chat text. */
    public JsonNode signDisplay(JsonNode value) {
        if (value == null || value.isNull()) return value;
        if (value.isArray()) {
            value.forEach(this::signDisplay);
        } else if (value.isObject()) {
            var object = (ObjectNode) value;
            var references = object.get("assets");
            if (references != null && references.isArray()) {
                var expiry = clock.instant().plus(properties.signedUrlTtl());
                for (var reference : references) {
                    if (!(reference instanceof ObjectNode image) || !image.hasNonNull("assetId") || !image.hasNonNull("url")) continue;
                    URI uri = URI.create(image.get("url").asText());
                    if (!(uri.getScheme() + "://" + uri.getRawAuthority()).equals(origin()) || uri.getRawQuery() != null
                            || uri.getFragment() != null || uri.getUserInfo() != null) {
                        throw new IllegalArgumentException("Invalid session image reference");
                    }
                    image.put("url", oss.generatePresignedUrl(properties.bucket(), uri.getPath().substring(1), Date.from(expiry)).toString());
                    image.put("expiresAt", expiry.toString());
                }
            }
            // Explicit protocol containers avoid re-signing the same assets or touching tool arguments.
            for (String key : List.of("turns", "turn", "input", "items", "item")) {
                if (object.has(key)) signDisplay(object.get(key));
            }
        }
        return value;
    }

    private String origin() {
        String endpoint = properties.endpoint();
        URI uri = URI.create(endpoint.contains("://") ? endpoint : "https://" + endpoint);
        return "https://" + properties.bucket() + "." + uri.getHost();
    }
}
