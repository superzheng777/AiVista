package com.superz.aivista.generation.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.superz.aivista.generation.message.TaskExecuteMessage;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;

class GenerationTaskExecuteListenerTests {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-31T05:00:00Z"), ZoneOffset.UTC);

    @Test
    void nacksWhenRedeliveryCountIsBelowLimit() throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        GenerationTaskExecutionService execution = mock(GenerationTaskExecutionService.class);
        when(mapper.readValue(any(byte[].class), any(Class.class))).thenReturn(new TaskExecuteMessage(1, 7, 0));
        when(execution.execute(any())).thenThrow(new IllegalStateException("temporary"));
        Channel channel = mock(Channel.class);

        listener(mapper, execution, mock(GenerationQueuedTaskFailureService.class)).consume(message(2), channel);

        verify(channel).basicNack(anyLong(), org.mockito.ArgumentMatchers.eq(false), org.mockito.ArgumentMatchers.eq(true));
    }

    @Test
    void acknowledgesAfterFailureIsSafelyConvergedAtLimit() throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        GenerationTaskExecutionService execution = mock(GenerationTaskExecutionService.class);
        GenerationQueuedTaskFailureService failure = mock(GenerationQueuedTaskFailureService.class);
        when(mapper.readValue(any(byte[].class), any(Class.class))).thenReturn(new TaskExecuteMessage(1, 7, 0));
        when(execution.execute(any())).thenThrow(new IllegalStateException("persistent"));
        when(failure.failIfStillRunningBeforeProviderCall(7, CLOCK.instant())).thenReturn(true);
        Channel channel = mock(Channel.class);

        listener(mapper, execution, failure).consume(message(3), channel);

        verify(channel).basicAck(anyLong(), org.mockito.ArgumentMatchers.eq(false));
        verify(channel, never()).basicNack(anyLong(), org.mockito.ArgumentMatchers.anyBoolean(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    @Test
    void requeuesWhenTaskCannotBeSafelyConvergedAtLimit() throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        GenerationTaskExecutionService execution = mock(GenerationTaskExecutionService.class);
        GenerationQueuedTaskFailureService failure = mock(GenerationQueuedTaskFailureService.class);
        when(mapper.readValue(any(byte[].class), any(Class.class))).thenReturn(new TaskExecuteMessage(1, 7, 0));
        when(execution.execute(any())).thenThrow(new IllegalStateException("after provider call"));
        when(failure.failIfStillRunningBeforeProviderCall(7, CLOCK.instant())).thenReturn(false);
        Channel channel = mock(Channel.class);

        listener(mapper, execution, failure).consume(message(3), channel);

        verify(channel).basicNack(anyLong(), org.mockito.ArgumentMatchers.eq(false), org.mockito.ArgumentMatchers.eq(true));
    }

    @Test
    void acknowledgesMalformedMessageWithoutExecutingTask() throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        when(mapper.readValue(any(byte[].class), any(Class.class))).thenThrow(new IllegalArgumentException("bad json"));
        GenerationTaskExecutionService execution = mock(GenerationTaskExecutionService.class);
        Channel channel = mock(Channel.class);

        listener(mapper, execution, mock(GenerationQueuedTaskFailureService.class)).consume(message(0), channel);

        verify(channel).basicAck(anyLong(), org.mockito.ArgumentMatchers.eq(false));
        verify(execution, never()).execute(any());
    }

    private static GenerationTaskExecuteListener listener(ObjectMapper mapper, GenerationTaskExecutionService execution,
            GenerationQueuedTaskFailureService failure) {
        return new GenerationTaskExecuteListener(mapper, execution, failure, CLOCK);
    }

    private static Message message(int deliveryCount) {
        return MessageBuilder.withBody(new byte[] {1})
                .setHeader("x-delivery-count", deliveryCount)
                .build();
    }
}
