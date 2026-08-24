package com.superz.aivista.generation.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.config.GenerationSseProperties;
import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.event.GenerationTaskStatusEvent;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.model.OutboxEventType;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 将已提交的任务状态 Outbox 事件发送给当前实例中的 SSE 连接。 */
@Service
public class GenerationStatusEventDispatcher {
    private final OutboxEventMapper outboxEventMapper;
    private final GenerationTaskMapper taskMapper;
    private final GenerationSseConnectionService connectionService;
    private final GenerationSseProperties properties;
    private final GenerationBailianProperties bailianProperties;
    private final Clock clock;
    private final ObjectMapper objectMapper;

    public GenerationStatusEventDispatcher(OutboxEventMapper outboxEventMapper, GenerationTaskMapper taskMapper,
            GenerationSseConnectionService connectionService, GenerationSseProperties properties,
            GenerationBailianProperties bailianProperties, Clock clock, ObjectMapper objectMapper) {
        this.outboxEventMapper = outboxEventMapper;
        this.taskMapper = taskMapper;
        this.connectionService = connectionService;
        this.properties = properties;
        this.bailianProperties = bailianProperties;
        this.clock = clock;
        this.objectMapper = objectMapper;
    }

    /** SSE 仅做在线通知；没有在线连接或单条连接写入失败都不影响任务真相。 */
    @Scheduled(fixedDelayString = "${app.generation.sse.dispatcher-fixed-delay}")
    public void dispatchAvailableEvents() {
        Instant now = clock.instant();
        recoverExpiredProcessingEvents(now);
        List<OutboxEvent> events = outboxEventMapper.selectAvailableByEventType(
                OutboxEventType.GENERATION_TASK_STATUS_CHANGED.name(), now, properties.dispatcherBatchSize());
        List<OutboxEvent> claimed = events.stream()
                .filter(event -> outboxEventMapper.claimPending(event.getId(), now, now) == 1)
                .toList();
        if (claimed.isEmpty()) {
            return;
        }
        Map<Long, GenerationTask> tasksById = taskMapper.selectStatusEventTasksByIds(
                claimed.stream().map(OutboxEvent::getAggregateId).distinct().toList()).stream()
                .collect(Collectors.toMap(GenerationTask::getId, Function.identity()));
        List<Long> publishedIds = new ArrayList<>();
        List<Long> failedIds = new ArrayList<>();
        for (OutboxEvent event : claimed) {
            GenerationTask task = tasksById.get(event.getAggregateId());
            JsonNode payload;
            try {
                payload = objectMapper.readTree(event.getPayloadJson());
            } catch (Exception exception) {
                failedIds.add(event.getId());
                continue;
            }
            if (task != null && payload.hasNonNull("status") && payload.hasNonNull("modelRetryCount")) {
                connectionService.publish(task.getUserId(), event.getId(), new GenerationTaskStatusEvent(
                        String.valueOf(task.getSessionId()), String.valueOf(task.getId()),
                        Math.toIntExact(event.getAggregateVersion()), payload.get("status").asText(),
                        payload.get("modelRetryCount").asInt(),
                        bailianProperties.maxRetries()));
            }
            publishedIds.add(event.getId());
        }
        if (!failedIds.isEmpty()) {
            outboxEventMapper.markFailedBatch(failedIds, "Invalid status event payload");
        }
        if (!publishedIds.isEmpty()) {
            outboxEventMapper.markPublishedBatch(publishedIds, clock.instant());
        }
    }

    /** Requeues notifications claimed by a dispatcher instance that stopped before completion. */
    private void recoverExpiredProcessingEvents(Instant now) {
        List<OutboxEvent> events = outboxEventMapper.selectProcessingLockedBefore(
                OutboxEventType.GENERATION_TASK_STATUS_CHANGED.name(), now.minus(properties.processingLease()),
                properties.dispatcherBatchSize());
        if (!events.isEmpty()) {
            events.forEach(event -> {
                event.setRetryCount(event.getRetryCount() + 1);
                event.setAvailableAt(now);
            });
            outboxEventMapper.rescheduleBatch(events, "SSE status event processing lease expired");
        }
    }
}
