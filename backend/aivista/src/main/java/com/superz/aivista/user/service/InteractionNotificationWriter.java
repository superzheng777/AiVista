package com.superz.aivista.user.service;

import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

/** Called inside the relationship transaction; a duplicate notification must not roll it back. */
@Component
public class InteractionNotificationWriter {
    private final UserNotificationMapper notifications;
    private final OutboxEventMapper outbox;
    private final Clock clock;

    public InteractionNotificationWriter(UserNotificationMapper notifications, OutboxEventMapper outbox, Clock clock) {
        this.notifications = notifications;
        this.outbox = outbox;
        this.clock = clock;
    }

    public void followed(long actorId, long recipientId) {
        create(actorId, recipientId, null, null, "USER_FOLLOWED", "follow:" + actorId + ':' + recipientId);
    }

    public void liked(long actorId, long recipientId, long assetId, long version) {
        if (actorId == recipientId) return;
        create(actorId, recipientId, assetId, version, "IMAGE_LIKED",
                "like:" + actorId + ':' + assetId + ':' + version);
    }

    private void create(long actorId, long recipientId, Long assetId, Long version, String eventType, String key) {
        Instant now = clock.instant();
        UserNotification notification = new UserNotification();
        notification.setRecipientUserId(recipientId);
        notification.setCategory("INTERACTION");
        notification.setEventType(eventType);
        notification.setActorUserId(actorId);
        notification.setAssetId(assetId);
        notification.setPublicationVersion(version);
        notification.setDedupKey(key);
        notification.setCreatedAt(now);
        try {
            if (notifications.insertInteraction(notification) != 1 || notification.getId() == null) {
                throw new IllegalStateException("Cannot create interaction notification");
            }
        } catch (DuplicateKeyException exception) {
            // Suppress only the expected dedup constraint; all other database failures stay fatal.
            for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
                if (cause instanceof SQLException sql && sql.getErrorCode() == 1062
                        && sql.getMessage() != null && sql.getMessage().contains("uq_notifications_recipient_dedup")) return;
            }
            throw exception;
        }
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.INTERACTION_NOTIFICATION_CREATED.name());
        event.setAggregateType("USER_NOTIFICATION");
        event.setAggregateId(notification.getId());
        event.setAggregateVersion(1L);
        event.setPayloadJson("{\"recipientUserId\":\"" + recipientId + "\",\"notificationId\":\"" + notification.getId() + "\"}");
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        outbox.insertSelective(event);
    }
}
