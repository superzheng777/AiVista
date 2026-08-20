package com.superz.aivista.generation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.superz.aivista.generation.message.TaskExecuteMessage;
import java.time.Clock;
import java.time.Instant;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/** 消费执行消息；只有任务已安全收敛或确认无需处理时才向 RabbitMQ ACK。 */
@Service
@ConditionalOnProperty(prefix = "app.generation.queue", name = "enabled", havingValue = "true")
public class GenerationTaskExecuteListener {
    private static final int MAX_REDELIVERIES = 3;
    private final ObjectMapper objectMapper;
    private final GenerationTaskExecutionService executionService;
    private final GenerationQueuedTaskFailureService queuedTaskFailureService;
    private final Clock clock;

    /**
     * 创建执行队列的消费者。
     *
     * @param objectMapper 将 RabbitMQ 消息体解析为任务定位信息
     * @param executionService 执行百炼调用并可靠创建后续转存命令
     * @param queuedTaskFailureService 消费多次失败后收敛任务、返还额度并创建状态事件
     * @param clock 为失败收敛写入统一的当前时间
     */
    public GenerationTaskExecuteListener(ObjectMapper objectMapper, GenerationTaskExecutionService executionService,
            GenerationQueuedTaskFailureService queuedTaskFailureService, Clock clock) {
        this.objectMapper = objectMapper;
        this.executionService = executionService;
        this.queuedTaskFailureService = queuedTaskFailureService;
        this.clock = clock;
    }

    /**
     * RabbitMQ 推送一条执行消息时由 Spring 自动调用。
     *
     * <p>消息可正常处理或任务已安全收敛时 ACK；可恢复的消费者异常 NACK 后重新入队。
     * 无法解析的消息没有可靠的任务 ID，直接 ACK 以避免永久占用队列。</p>
     */
    @RabbitListener(queues = "${app.generation.queue.generation-name}",
            containerFactory = "generationTaskListenerContainerFactory")
    public void consume(Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        TaskExecuteMessage command;
        try {
            command = objectMapper.readValue(message.getBody(), TaskExecuteMessage.class);
        } catch (Exception exception) {
            channel.basicAck(deliveryTag, false);
            return;
        }
        try {
            if (executionService.execute(command)) {
                channel.basicAck(deliveryTag, false);
            } else {
                handleFailure(message, channel, deliveryTag, command);
            }
        } catch (Exception exception) {
            handleFailure(message, channel, deliveryTag, command);
        }
    }

    /**
     * 处理执行服务未能正常完成的情况。
     *
     * <p>同一 Quorum Queue 消息最多重投三次。达到上限时，只有尚未发出百炼请求的运行中任务
     * 才能安全收敛为消费失败；否则继续 NACK，由任务执行服务中的调用结果未知保护处理。</p>
     */
    private void handleFailure(Message message, Channel channel, long deliveryTag, TaskExecuteMessage command) throws Exception {
        if (deliveryCount(message) >= MAX_REDELIVERIES
                && queuedTaskFailureService.failIfStillRunningBeforeProviderCall(command.taskId(), clock.instant())) {
            channel.basicAck(deliveryTag, false);
            return;
        }
        channel.basicNack(deliveryTag, false, true);
    }

    /**
     * 读取 Quorum Queue 为重投消息附带的失败投递次数；首次投递通常没有此 Header，按零次处理。
     */
    private static int deliveryCount(Message message) {
        Object value = message.getMessageProperties().getHeaders().get("x-delivery-count");
        return value instanceof Number number ? number.intValue() : 0;
    }
}
