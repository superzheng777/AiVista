package com.superz.aivista.user.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationAssetImageResponse;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.publication.service.InspirationQueryService;
import com.superz.aivista.user.dto.InteractionNotificationActorResponse;
import com.superz.aivista.user.dto.InteractionNotificationPageResponse;
import com.superz.aivista.user.dto.InteractionNotificationResponse;
import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.Clock;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** Queries the current user's persisted interaction notifications. */
@Service
public class InteractionNotificationService {
    private static final int PAGE_SIZE = 15;

    private final UserNotificationMapper notifications;
    private final UserMapper users;
    private final ImageAssetMapper images;
    private final InspirationQueryService inspirations;
    private final Clock clock;

    public InteractionNotificationService(UserNotificationMapper notifications, UserMapper users,
            ImageAssetMapper images, InspirationQueryService inspirations, Clock clock) {
        this.notifications = notifications;
        this.users = users;
        this.images = images;
        this.inspirations = inspirations;
        this.clock = clock;
    }

    public InteractionNotificationPageResponse list(long userId, String cursor) {
        Cursor decodedCursor = cursor == null ? null : decode(cursor);
        List<UserNotification> page = notifications.selectInteractionPageByRecipientUserId(userId,
                decodedCursor == null ? null : decodedCursor.createdAt(),
                decodedCursor == null ? null : decodedCursor.notificationId(), PAGE_SIZE + 1);
        boolean hasNext = page.size() > PAGE_SIZE;
        List<UserNotification> items = hasNext ? page.subList(0, PAGE_SIZE) : page;
        Map<Long, InteractionNotificationActorResponse> actors = actors(items);
        Map<Long, GenerationAssetImageResponse> publicationImages = publicationImages(userId, items);
        List<InteractionNotificationResponse> responseItems = items.stream()
                .map(notification -> new InteractionNotificationResponse(
                        String.valueOf(notification.getId()), notification.getEventType(),
                        actors.get(notification.getActorUserId()), publicationImages.get(notification.getId()),
                        notification.getReadAt(), notification.getCreatedAt()))
                .toList();
        String nextCursor = hasNext ? encode(items.getLast()) : null;
        return new InteractionNotificationPageResponse(responseItems, nextCursor);
    }

    public void markRead(long userId, long notificationId) {
        if (notifications.markInteractionRead(notificationId, userId, clock.instant()) != 1) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
    }

    public void markAllRead(long userId) {
        notifications.markAllInteractionRead(userId, clock.instant());
    }

    public void delete(long userId, long notificationId) {
        notifications.softDeleteInteraction(notificationId, userId, clock.instant());
    }

    public void deleteBatch(long userId, List<String> notificationIds) {
        List<Long> ids = notificationIds.stream().map(InteractionNotificationService::notificationId)
                .distinct().toList();
        if (ids.size() > 100) throw new BusinessException(ErrorCode.VALIDATION_ERROR);
        notifications.softDeleteInteractions(userId, ids, clock.instant());
    }

    public NotificationUnreadCount unreadCount(long userId) {
        long official = notifications.countUnreadOfficialByRecipientUserId(userId);
        long interaction = notifications.countUnreadInteractionByRecipientUserId(userId);
        return new NotificationUnreadCount(official, interaction, official + interaction);
    }

    private Map<Long, InteractionNotificationActorResponse> actors(List<UserNotification> notifications) {
        List<Long> actorIds = notifications.stream().map(UserNotification::getActorUserId)
                .filter(java.util.Objects::nonNull).distinct().toList();
        if (actorIds.isEmpty()) return Map.of();
        return users.selectPublicByIds(actorIds).stream().collect(Collectors.toMap(User::getId,
                user -> new InteractionNotificationActorResponse(String.valueOf(user.getId()), user.getNickname(),
                        user.getAvatarUrl())));
    }

    private Map<Long, GenerationAssetImageResponse> publicationImages(long viewerUserId,
            List<UserNotification> notifications) {
        List<Long> imageIds = notifications.stream().map(UserNotification::getAssetId)
                .filter(java.util.Objects::nonNull).distinct().toList();
        if (imageIds.isEmpty()) return Map.of();
        Map<Long, GenerationAssetImageResponse> imagesById = inspirations.toPublicImages(
                images.selectPublishedByIds(imageIds), viewerUserId).stream().collect(Collectors.toMap(
                        image -> Long.valueOf(image.imageId()), Function.identity()));
        return notifications.stream().filter(notification -> notification.getAssetId() != null
                        && notification.getPublicationVersion() != null)
                .filter(notification -> {
                    GenerationAssetImageResponse image = imagesById.get(notification.getAssetId());
                    return image != null && image.publicationVersion() == notification.getPublicationVersion();
                })
                .collect(Collectors.toMap(UserNotification::getId,
                        notification -> imagesById.get(notification.getAssetId())));
    }

    private static String encode(UserNotification notification) {
        String value = notification.getCreatedAt().toEpochMilli() + ":" + notification.getId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decode(String encoded) {
        try {
            String value = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
            String[] values = value.split(":", -1);
            if (values.length != 2) throw new IllegalArgumentException();
            long timestamp = Long.parseLong(values[0]);
            long notificationId = Long.parseLong(values[1]);
            if (timestamp < 0 || notificationId <= 0) throw new IllegalArgumentException();
            return new Cursor(Instant.ofEpochMilli(timestamp), notificationId);
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

    public record NotificationUnreadCount(long officialUnreadCount, long interactionUnreadCount,
            long totalUnreadCount) {
    }
}
