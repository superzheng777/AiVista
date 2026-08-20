package com.superz.aivista.generation.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.superz.aivista.generation.message.ImageTransferMessage;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;

class GenerationImageTransferListenerTests {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-20T12:00:00Z"), ZoneOffset.UTC);

    @Test
    void acknowledgesOnlyAfterTransferExecutionConverges() throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        GenerationImageTransferExecutionService execution = mock(GenerationImageTransferExecutionService.class);
        when(mapper.readValue(any(byte[].class), any(Class.class)))
                .thenReturn(new ImageTransferMessage(11L, 301L, 2));
        when(execution.execute(any())).thenReturn(true);
        Channel channel = mock(Channel.class);

        listener(mapper, execution, mock(GenerationImageTransferFailureService.class))
                .consume(message(0), channel);

        verify(channel).basicAck(anyLong(), eq(false));
        verify(channel, never()).basicNack(anyLong(), anyBoolean(), anyBoolean());
    }

    @Test
    void requeuesInfrastructureFailureBeforeDeliveryLimit() throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        GenerationImageTransferExecutionService execution = mock(GenerationImageTransferExecutionService.class);
        when(mapper.readValue(any(byte[].class), any(Class.class)))
                .thenReturn(new ImageTransferMessage(11L, 301L, 2));
        when(execution.execute(any())).thenThrow(new IllegalStateException("database unavailable"));
        Channel channel = mock(Channel.class);

        listener(mapper, execution, mock(GenerationImageTransferFailureService.class))
                .consume(message(2), channel);

        verify(channel).basicNack(anyLong(), eq(false), eq(true));
    }

    @Test
    void acknowledgesAfterPersistentFailureIsConvergedAtDeliveryLimit() throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        GenerationImageTransferExecutionService execution = mock(GenerationImageTransferExecutionService.class);
        GenerationImageTransferFailureService failure = mock(GenerationImageTransferFailureService.class);
        when(mapper.readValue(any(byte[].class), any(Class.class)))
                .thenReturn(new ImageTransferMessage(11L, 301L, 2));
        when(execution.execute(any())).thenThrow(new IllegalStateException("persistent"));
        when(failure.failConsumption(301L, 2, CLOCK.instant())).thenReturn(true);
        Channel channel = mock(Channel.class);

        listener(mapper, execution, failure).consume(message(3), channel);

        verify(channel).basicAck(anyLong(), eq(false));
        verify(channel, never()).basicNack(anyLong(), anyBoolean(), anyBoolean());
    }

    private static GenerationImageTransferListener listener(ObjectMapper mapper,
            GenerationImageTransferExecutionService execution, GenerationImageTransferFailureService failure) {
        return new GenerationImageTransferListener(mapper, execution, failure, CLOCK);
    }

    private static Message message(int deliveryCount) {
        return MessageBuilder.withBody(new byte[] {1})
                .setHeader("x-delivery-count", deliveryCount)
                .build();
    }
}
