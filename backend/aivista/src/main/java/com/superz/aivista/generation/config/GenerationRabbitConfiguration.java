package com.superz.aivista.generation.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.ExchangeBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.AcknowledgeMode;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 显式声明生成命令交换机、两条持久化 Quorum Queue 及独立消费者容器。 */
@Configuration
@ConditionalOnProperty(prefix = "app.generation.queue", name = "enabled", havingValue = "true")
public class GenerationRabbitConfiguration {
    @Bean
    DirectExchange generationCommandExchange(GenerationQueueProperties properties) {
        return ExchangeBuilder.directExchange(properties.exchange()).durable(true).build();
    }

    @Bean
    Queue generationTaskExecuteQueue(GenerationQueueProperties properties) {
        return QueueBuilder.durable(properties.generationName())
                .withArgument("x-queue-type", "quorum")
                .build();
    }

    @Bean
    Binding generationTaskExecuteBinding(@Qualifier("generationTaskExecuteQueue") Queue generationTaskExecuteQueue,
            DirectExchange generationCommandExchange, GenerationQueueProperties properties) {
        return BindingBuilder.bind(generationTaskExecuteQueue)
                .to(generationCommandExchange)
                .with(properties.generationRoutingKey());
    }

    @Bean
    Queue generationImageTransferQueue(GenerationQueueProperties properties) {
        return QueueBuilder.durable(properties.transferName())
                .withArgument("x-queue-type", "quorum")
                .build();
    }

    @Bean
    Binding generationImageTransferBinding(
            @Qualifier("generationImageTransferQueue") Queue generationImageTransferQueue,
            DirectExchange generationCommandExchange, GenerationQueueProperties properties) {
        return BindingBuilder.bind(generationImageTransferQueue)
                .to(generationCommandExchange)
                .with(properties.transferRoutingKey());
    }

    /** 生成消费者在持久化百炼结果并创建转存命令后确认；单个消费者一次只领取一条消息。 */
    @Bean
    SimpleRabbitListenerContainerFactory generationTaskListenerContainerFactory(
            ConnectionFactory connectionFactory, GenerationQueueProperties properties) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        factory.setConcurrentConsumers(properties.generationConsumerConcurrency());
        factory.setPrefetchCount(1);
        return factory;
    }

    /** 转存工作器使用独立线程池，避免 OSS 网络操作占用百炼生成消费者。 */
    @Bean
    SimpleRabbitListenerContainerFactory generationImageTransferListenerContainerFactory(
            ConnectionFactory connectionFactory, GenerationQueueProperties properties) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        factory.setConcurrentConsumers(properties.transferConsumerConcurrency());
        factory.setPrefetchCount(1);
        return factory;
    }
}
