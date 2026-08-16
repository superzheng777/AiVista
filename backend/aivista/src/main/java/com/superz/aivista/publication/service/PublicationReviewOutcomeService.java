package com.superz.aivista.publication.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.publication.model.PublicationViolation;
import com.superz.aivista.user.entity.UserNotification;
import com.superz.aivista.user.mapper.UserNotificationMapper;
import com.superz.aivista.search.service.SearchIndexOutboxEvent;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Atomically records a final publication decision, notification, and SSE event. */
@Service
public class PublicationReviewOutcomeService {
    private final GenerationImageMapper images;
    private final OutboxEventMapper outbox;
    private final UserNotificationMapper notifications;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    public PublicationReviewOutcomeService(GenerationImageMapper images, OutboxEventMapper outbox,
            UserNotificationMapper notifications, Clock clock, ObjectMapper objectMapper) {
        this.images = images;
        this.outbox = outbox;
        this.notifications = notifications;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void approve(GenerationImage image, long version) {
        complete(image, version, "APPROVED", "图片发布成功", "你的图片已发布到灵感页。", null,
                () -> images.approvePublication(image.getId(), version, clock.instant()));
    }

    @Transactional
    public void reject(GenerationImage image, long version, List<PublicationViolation> violations) {
        complete(image, version, "REJECTED", "图片发布未通过", rejectionContent(violations), metadataJson(violations),
                () -> images.rejectPublication(image.getId(), version, clock.instant()));
    }

    @Transactional
    public void fail(GenerationImage image, long version) {
        complete(image, version, "FAILED", "图片发布失败", "发布审核服务暂不可用，请稍后重新发布。", null,
                () -> images.failPublication(image.getId(), version, clock.instant()));
    }

    private void complete(GenerationImage image, long version, String status, String title, String content,
            String metadataJson, Completion completion) {
        if (completion.apply() != 1) {
            return;
        }
        Instant now = clock.instant();
        UserNotification notification = new UserNotification();
        notification.setRecipientUserId(image.getUserId());
        notification.setCategory("OFFICIAL");
        notification.setEventType("PUBLICATION_" + status);
        notification.setImageId(image.getId());
        notification.setTitle(title);
        notification.setContent(content);
        notification.setMetadataJson(metadataJson);
        notification.setCreatedAt(now);
        notifications.insertSelective(notification);
        outbox.insertSelective(PublicationStatusOutboxEvent.create(image.getId(), version, status, now));
        if ("APPROVED".equals(status)) {
            outbox.insertSelective(SearchIndexOutboxEvent.create(image.getId(), version, now));
        }
    }

    private String metadataJson(List<PublicationViolation> violations) {
        try {
            return objectMapper.writeValueAsString(java.util.Map.of("violations", violations));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot serialize publication notification metadata", exception);
        }
    }

    private static String rejectionContent(List<PublicationViolation> violations) {
        if (violations.size() == 2) {
            return "标题和描述包含不符合社区规范的内容，请修改后重新发布。";
        }
        return "title".equals(violations.getFirst().field())
                ? "标题包含不符合社区规范的内容，请修改后重新发布。"
                : "描述包含不符合社区规范的内容，请修改后重新发布。";
    }

    @FunctionalInterface
    private interface Completion {
        int apply();
    }
}
