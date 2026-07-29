package com.superz.aivista.generation.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.AcknowledgeMode;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 仅在显式启用队列时声明首版持久化 Quorum Queue。 */
@Configuration
@ConditionalOnProperty(prefix = "app.generation.queue", name = "enabled", havingValue = "true")
public class GenerationRabbitConfiguration {
    /**
     * 当前工程未由 Web 层自动提供 ObjectMapper；该 Bean 仅用于 Outbox 最小任务消息的 JSON 序列化。
     */
    @Bean
    ObjectMapper generationMessageObjectMapper() {
        return new ObjectMapper();
    }

    @Bean
    Queue generationTaskExecuteQueue(GenerationQueueProperties properties) {
        return QueueBuilder.durable(properties.name())
                .withArgument("x-queue-type", "quorum")
                .build();
    }

    /** 生成任务在业务终态写入后才确认；单个消费者一次只领取一条消息。 */
    @Bean
    SimpleRabbitListenerContainerFactory generationTaskListenerContainerFactory(
            ConnectionFactory connectionFactory, GenerationQueueProperties properties) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        factory.setConcurrentConsumers(properties.consumerConcurrency());
        factory.setPrefetchCount(1);
        return factory;
    }
}
