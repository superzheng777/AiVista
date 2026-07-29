package com.superz.aivista.generation.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.superz.aivista.generation.message.TaskExecuteMessage;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

/** 消费执行消息；只有任务已安全收敛或确认无需处理时才向 RabbitMQ ACK。 */
@Service
public class GenerationTaskExecuteListener {
    private final ObjectMapper objectMapper;
    private final GenerationTaskExecutionService executionService;

    /** 注入消息反序列化器和实际任务执行服务。 */
    public GenerationTaskExecuteListener(ObjectMapper objectMapper, GenerationTaskExecutionService executionService) {
        this.objectMapper = objectMapper;
        this.executionService = executionService;
    }

    /** 反序列化消息并按执行结果手动 ACK；基础设施异常则 NACK 后重新入队。 */
    @RabbitListener(queues = "${app.generation.queue.name}",
            containerFactory = "generationTaskListenerContainerFactory")
    public void consume(Message message, Channel channel) throws Exception {
        long deliveryTag = message.getMessageProperties().getDeliveryTag();
        try {
            TaskExecuteMessage command = objectMapper.readValue(message.getBody(), TaskExecuteMessage.class);
            if (executionService.execute(command)) {
                channel.basicAck(deliveryTag, false);
            } else {
                channel.basicNack(deliveryTag, false, true);
            }
        } catch (Exception exception) {
            channel.basicNack(deliveryTag, false, true);
        }
    }
}
