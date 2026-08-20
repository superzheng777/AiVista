package com.superz.aivista.generation.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.config.GenerationQueueProperties;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

class GenerationOutboxDispatcherTests {
    private static final Instant NOW = Instant.parse("2026-08-20T12:00:00Z");

    @Test
    void routesGenerationAndTransferCommandsThroughAlignedDirectExchangeKeys() {
        OutboxEventMapper mapper = mock(OutboxEventMapper.class);
        RabbitTemplate template = mock(RabbitTemplate.class);
        OutboxEvent generation = event(11L, "GENERATION_TASK_EXECUTE", 1L);
        OutboxEvent transfer = event(12L, "GENERATION_IMAGE_TRANSFER", 2L);
        when(mapper.selectAvailableByEventType("GENERATION_TASK_EXECUTE", NOW, 20))
                .thenReturn(List.of(generation));
        when(mapper.selectAvailableByEventType("GENERATION_IMAGE_TRANSFER", NOW, 20))
                .thenReturn(List.of(transfer));
        when(mapper.claimPending(11L, NOW, NOW)).thenReturn(1);
        when(mapper.claimPending(12L, NOW, NOW)).thenReturn(1);
        doAnswer(invocation -> {
            CorrelationData correlation = invocation.getArgument(3);
            correlation.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(template).send(any(String.class), any(String.class), any(Message.class), any(CorrelationData.class));

        new GenerationOutboxDispatcher(mapper, mock(GenerationQueuedTaskFailureService.class),
                mock(GenerationImageTransferFailureService.class), template, new ObjectMapper(), properties(),
                Clock.fixed(NOW, ZoneOffset.UTC)).dispatchAvailableEvents();

        verify(template).send(eq("aivista.generation.commands"), eq("generation.task.execute"),
                any(Message.class), any(CorrelationData.class));
        verify(template).send(eq("aivista.generation.commands"), eq("generation.image.transfer"),
                any(Message.class), any(CorrelationData.class));
        verify(mapper).markPublished(11L, NOW);
        verify(mapper).markPublished(12L, NOW);
    }

    private static OutboxEvent event(long id, String type, long version) {
        OutboxEvent event = new OutboxEvent();
        event.setId(id);
        event.setEventType(type);
        event.setAggregateId(301L);
        event.setAggregateVersion(version);
        event.setRetryCount(0);
        return event;
    }

    static GenerationQueueProperties properties() {
        return new GenerationQueueProperties(true, "aivista.generation.commands",
                "generation.task.execute", "generation.task.execute", 25,
                "generation.image.transfer", "generation.image.transfer", 15,
                Duration.ofSeconds(1), 20, 5, Duration.ofSeconds(5),
                Duration.ofMinutes(3), Duration.ofSeconds(30),
                Duration.ofMinutes(2), Duration.ofSeconds(30));
    }
}
