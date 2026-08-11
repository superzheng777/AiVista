package com.superz.aivista.user.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.user.dto.OfficialNotificationResponse;
import com.superz.aivista.user.dto.UnreadOfficialNotificationCountResponse;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** Queries and acknowledges the current user's official notifications. */
@Service
public class OfficialNotificationService {
    private final UserNotificationMapper notificationMapper;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public OfficialNotificationService(
            UserNotificationMapper notificationMapper, ObjectMapper objectMapper, Clock clock) {
        this.notificationMapper = notificationMapper;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public List<OfficialNotificationResponse> list(long userId) {
        return notificationMapper.selectOfficialByRecipientUserId(userId).stream()
                .map(this::toResponse)
                .toList();
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
        if (notificationMapper.softDeleteOfficial(notificationId, userId, clock.instant()) != 1) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
    }

    public void deleteAll(long userId) {
        notificationMapper.softDeleteAllOfficial(userId, clock.instant());
    }

    private OfficialNotificationResponse toResponse(UserNotification notification) {
        return new OfficialNotificationResponse(
                String.valueOf(notification.getId()),
                notification.getEventType(),
                notification.getImageId() == null ? null : String.valueOf(notification.getImageId()),
                notification.getTitle(),
                notification.getContent(),
                metadata(notification.getMetadataJson()),
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
}
