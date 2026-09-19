package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.config.GenerationTaskProperties;
import com.superz.aivista.generation.dto.CreateAgentCreationRequest;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AgentCreationServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-09T01:02:03Z");

    @Test
    void createsAgentCreationAndExecuteOutboxWithoutGenericIdempotency() {
        UserMapper users = mock(UserMapper.class);
        ImageAssetMapper assets = mock(ImageAssetMapper.class);
        OutboxEventMapper outbox = mock(OutboxEventMapper.class);
        CreationTaskStartService starts = mock(CreationTaskStartService.class);
        when(users.selectIdForUpdate(7L)).thenReturn(7L);
        GenerationSession session = new GenerationSession();
        session.setId(101L);
        CreationTask creation = new CreationTask();
        creation.setId(151L);
        creation.setStatus("RUNNING");
        creation.setRevision(0L);
        creation.setCreatedAt(NOW);
        when(starts.start(7L, null, "设计一张海报", "AGENT", java.util.List.of(), false,
                "AUTO", 0, NOW)).thenReturn(new CreationTaskStartService.StartedCreation(session, creation));
        var properties = new GenerationTaskProperties("model", 4, 12, 1000, 500, 1, 6,
                Map.of("1:1", "2048*2048"));
        var service = new AgentCreationService(users, assets, outbox, starts,
                new GenerationTaskSpecificationValidator(properties), Clock.fixed(NOW, ZoneOffset.UTC));

        var response = service.create(7L,
                new CreateAgentCreationRequest(null, "设计一张海报", java.util.List.of(), "AUTO", 0));

        assertThat(response.creationId()).isEqualTo("151");
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outbox).insertSelective(event.capture());
        assertThat(event.getValue().getEventType()).isEqualTo("AGENT_EXECUTE");
    }
}
