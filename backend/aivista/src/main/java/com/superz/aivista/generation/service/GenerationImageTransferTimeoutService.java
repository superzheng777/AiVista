package com.superz.aivista.generation.service;

import com.superz.aivista.generation.config.GenerationQueueProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 将超过两分钟仍未被转存消费者领取的任务收敛为失败。 */
@Service
@ConditionalOnProperty(prefix = "app.generation.queue", name = "enabled", havingValue = "true")
public class GenerationImageTransferTimeoutService {
    private final GenerationTaskMapper taskMapper;
    private final GenerationImageTransferFailureService failureService;
    private final GenerationQueueProperties properties;
    private final Clock clock;

    public GenerationImageTransferTimeoutService(GenerationTaskMapper taskMapper,
            GenerationImageTransferFailureService failureService,
            GenerationQueueProperties properties, Clock clock) {
        this.taskMapper = taskMapper;
        this.failureService = failureService;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.generation.queue.transfer-timeout-fixed-delay}")
    public void failWaitingTransfers() {
        Instant now = clock.instant();
        List<GenerationTask> tasks = taskMapper.selectTransferWaitingBefore(
                now.minus(properties.transferTimeout()), properties.dispatcherBatchSize());
        for (GenerationTask task : tasks) {
            failureService.failWaitingTimeout(task.getId(), task.getTaskVersion(), now);
        }
    }
}
