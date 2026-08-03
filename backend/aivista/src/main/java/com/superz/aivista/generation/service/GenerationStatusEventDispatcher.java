package com.superz.aivista.generation.service;

import com.superz.aivista.generation.config.GenerationSseProperties;
import com.superz.aivista.generation.config.GenerationBailianProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.event.GenerationTaskStatusEvent;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
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

    public GenerationStatusEventDispatcher(OutboxEventMapper outboxEventMapper, GenerationTaskMapper taskMapper,
            GenerationSseConnectionService connectionService, GenerationSseProperties properties,
            GenerationBailianProperties bailianProperties, Clock clock) {
        this.outboxEventMapper = outboxEventMapper;
        this.taskMapper = taskMapper;
        this.connectionService = connectionService;
        this.properties = properties;
        this.bailianProperties = bailianProperties;
        this.clock = clock;
    }

    /** SSE 仅做在线通知；没有在线连接或单条连接写入失败都不影响任务真相。 */
    @Scheduled(fixedDelayString = "${app.generation.sse.dispatcher-fixed-delay}")
    public void dispatchAvailableEvents() {
        Instant now = clock.instant();
        List<OutboxEvent> events = outboxEventMapper.selectAvailableTaskStatusChanges(now,
                properties.dispatcherBatchSize());
        for (OutboxEvent event : events) {
            if (outboxEventMapper.claimPending(event.getId(), now, now) != 1) {
                continue;
            }
            GenerationTask task = taskMapper.selectStatusEventTaskById(event.getTaskId());
            if (task != null && event.getTaskStatus() != null && event.getModelRetryCount() != null) {
                connectionService.publish(task.getUserId(), event.getId(), new GenerationTaskStatusEvent(
                        String.valueOf(task.getSessionId()), String.valueOf(task.getId()),
                        event.getTaskVersion(), event.getTaskStatus(), event.getModelRetryCount(),
                        bailianProperties.maxRetries()));
            }
            outboxEventMapper.markPublished(event.getId(), clock.instant());
        }
    }
}
