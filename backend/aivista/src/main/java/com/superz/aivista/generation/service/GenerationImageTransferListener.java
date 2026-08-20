package com.superz.aivista.generation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.superz.aivista.generation.message.ImageTransferMessage;
import java.time.Clock;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/** 消费独立图片转存命令；只有任务终态或消息已过期时才手动 ACK。 */
@Service
@ConditionalOnProperty(prefix = "app.generation.queue", name = "enabled", havingValue = "true")
public class GenerationImageTransferListener {
    private static final int MAX_REDELIVERIES = 3;

    private final ObjectMapper objectMapper;
    private final GenerationImageTransferExecutionService executionService;
    private final GenerationImageTransferFailureService failureService;
    private final Clock clock;

    public GenerationImageTransferListener(ObjectMapper objectMapper,
            GenerationImageTransferExecutionService executionService,
            GenerationImageTransferFailureService failureService, Clock clock) {
        this.objectMapper = objectMapper;
        this.executionService = executionService;
        this.failureService = failureService;
        this.clock = clock;
    }

    @RabbitListener(queues = "${app.generation.queue.transfer-name}",
            containerFactory = "generationImageTransferListenerContainerFactory")
    public void consume(Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        ImageTransferMessage command;
        try {
            command = objectMapper.readValue(message.getBody(), ImageTransferMessage.class);
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

    private void handleFailure(Message message, Channel channel, long deliveryTag,
            ImageTransferMessage command) throws Exception {
        if (deliveryCount(message) >= MAX_REDELIVERIES
                && failureService.failConsumption(command.taskId(), command.taskVersion(), clock.instant())) {
            channel.basicAck(deliveryTag, false);
            return;
        }
        channel.basicNack(deliveryTag, false, true);
    }

    private static int deliveryCount(Message message) {
        Object value = message.getMessageProperties().getHeaders().get("x-delivery-count");
        return value instanceof Number number ? number.intValue() : 0;
    }
}
