package com.superz.aivista.user.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.service.GenerationAssetQueryService;
import com.superz.aivista.user.dto.OfficialNotificationPageResponse;
import com.superz.aivista.user.dto.OfficialNotificationResponse;
import com.superz.aivista.user.dto.UnreadOfficialNotificationCountResponse;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.time.Clock;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** Queries and acknowledges the current user's official notifications. */
@Service
public class OfficialNotificationService {
    private static final int PAGE_SIZE = 15;
    private final UserNotificationMapper notificationMapper;
    private final GenerationAssetQueryService assets;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public OfficialNotificationService(
            UserNotificationMapper notificationMapper, GenerationAssetQueryService assets, ObjectMapper objectMapper,
            Clock clock) {
        this.notificationMapper = notificationMapper;
        this.assets = assets;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public OfficialNotificationPageResponse list(long userId, String cursor) {
        Cursor decoded = cursor == null ? null : decode(cursor);
        List<UserNotification> page = notificationMapper.selectOfficialPageByRecipientUserId(userId,
                decoded == null ? null : decoded.createdAt(), decoded == null ? null : decoded.notificationId(),
                PAGE_SIZE + 1);
        boolean hasNext = page.size() > PAGE_SIZE;
        List<UserNotification> notifications = hasNext ? page.subList(0, PAGE_SIZE) : page;
        Map<Long, GenerationAssetImageResponse> images = assets.getByIds(userId, notifications.stream()
                .map(UserNotification::getImageId).filter(Objects::nonNull).distinct().toList());
        List<OfficialNotificationResponse> items = notifications.stream()
                .map(notification -> toResponse(notification, images.get(notification.getImageId()))).toList();
        return new OfficialNotificationPageResponse(items, hasNext ? encode(notifications.getLast()) : null);
    }

    public UnreadOfficialNotificationCountResponse unreadCount(long userId) {
        return new UnreadOfficialNotificationCountResponse(
                notificationMapper.countUnreadOfficialByRecipientUserId(userId));
    }

    public void markRead(long userId, long notificationId) {
        if (notificationMapper.markOfficialRead(notificationId, userId, clock.instant()) != 1) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
    }

    public void markAllRead(long userId) {
        notificationMapper.markAllOfficialRead(userId, clock.instant());
    }

    public void delete(long userId, long notificationId) {
        notificationMapper.softDeleteOfficial(notificationId, userId, clock.instant());
    }

    public void deleteBatch(long userId, List<String> notificationIds) {
        List<Long> ids = notificationIds.stream().map(OfficialNotificationService::notificationId).distinct().toList();
        if (ids.size() > 100) throw new BusinessException(ErrorCode.VALIDATION_ERROR);
        notificationMapper.softDeleteOfficials(userId, ids, clock.instant());
    }

    private OfficialNotificationResponse toResponse(UserNotification notification, GenerationAssetImageResponse image) {
        return new OfficialNotificationResponse(
                String.valueOf(notification.getId()),
                notification.getEventType(),
                notification.getTitle(),
                notification.getContent(),
                metadata(notification.getMetadataJson()),
                image,
                notification.getReadAt(),
                notification.getCreatedAt());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> metadata(String metadataJson) {
        if (metadataJson == null) {
            return null;
        }
        try {
            return (Map<String, Object>) objectMapper.readValue(metadataJson, Map.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot deserialize notification metadata", exception);
        }
    }

    private static String encode(UserNotification notification) {
        String value = notification.getCreatedAt().toEpochMilli() + ":" + notification.getId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decode(String encoded) {
        try {
            String[] values = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8).split(":", -1);
            if (values.length != 2) throw new IllegalArgumentException();
            long timestamp = Long.parseLong(values[0]);
            long id = Long.parseLong(values[1]);
            if (timestamp < 0 || id <= 0) throw new IllegalArgumentException();
            return new Cursor(Instant.ofEpochMilli(timestamp), id);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_CURSOR);
        }
    }

    private static long notificationId(String value) {
        try {
            long id = Long.parseLong(value);
            if (id <= 0) throw new NumberFormatException();
            return id;
        } catch (NumberFormatException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR);
        }
    }

    private record Cursor(Instant createdAt, long notificationId) {
    }
}
