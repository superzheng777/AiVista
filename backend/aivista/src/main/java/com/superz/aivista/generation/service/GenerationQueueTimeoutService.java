package com.superz.aivista.generation.service;

import com.superz.aivista.generation.config.GenerationQueueProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.model.GenerationFailureCode;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 定期收敛超过允许排队时长、仍未被工作器领取的任务。
 *
 * <p>不依赖 RabbitMQ 消息 TTL：消息即使延迟到达，工作器也能根据 MySQL 中已经终态的任务直接确认。
 * 任务超时后的状态变更和每日额度返还统一委托给 {@link GenerationQueuedTaskFailureService}，
 * 以保证与 Outbox 投递失败使用相同的幂等规则。</p>
 */
@Service
@ConditionalOnProperty(prefix = "app.generation.queue", name = "enabled", havingValue = "true")
public class GenerationQueueTimeoutService {
    private final GenerationTaskMapper taskMapper;
    private final GenerationQueuedTaskFailureService queuedTaskFailureService;
    private final GenerationQueueProperties properties;
    private final Clock clock;

    public GenerationQueueTimeoutService(GenerationTaskMapper taskMapper,
            GenerationQueuedTaskFailureService queuedTaskFailureService,
            GenerationQueueProperties properties, Clock clock) {
        this.taskMapper = taskMapper;
        this.queuedTaskFailureService = queuedTaskFailureService;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.generation.queue.queue-timeout-fixed-delay}")
    public void failTimedOutTasks() {
        Instant now = clock.instant();
        List<GenerationTask> tasks = taskMapper.selectQueuedBefore(
                now.minus(properties.queueTimeout()), properties.dispatcherBatchSize());
        for (GenerationTask task : tasks) {
            queuedTaskFailureService.failIfStillQueued(task.getId(),
                    GenerationFailureCode.QUEUE_TIMEOUT, now);
        }
    }
}
