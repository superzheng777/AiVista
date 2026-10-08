package com.superz.aivista.generation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.superz.aivista.generation.config.GenerationWorkerApiProperties;
import com.superz.aivista.generation.service.CreationImageService;
import com.superz.aivista.generation.service.GenerationSseConnectionService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

class CreationRuntimeControllerTests {
    @Test
    void acknowledgesButDoesNotSignOrForwardLateEventsForDeletedSessions() {
        var jdbc = mock(JdbcTemplate.class);
        var images = mock(CreationImageService.class);
        var events = mock(GenerationSseConnectionService.class);
        var controller = new CreationRuntimeController(new GenerationWorkerApiProperties("test-token"), images, events, jdbc);
        var json = JsonMapper.builder().build();
        var deleted = json.readTree("{\"userId\":\"4\",\"sessionId\":\"6\",\"type\":\"creation.item.upserted\"}");
        var visible = json.readTree("{\"userId\":\"4\",\"sessionId\":\"7\",\"type\":\"creation.updated\"}");
        when(jdbc.queryForObject(contains("deleted_at IS NULL"), eq(Integer.class), eq(6L), eq(4L))).thenReturn(0);
        when(jdbc.queryForObject(contains("deleted_at IS NULL"), eq(Integer.class), eq(7L), eq(4L))).thenReturn(1);
        when(images.signDisplay(visible)).thenReturn(visible);

        assertThat(controller.publish("test-token", new CreationRuntimeController.Events(List.of(deleted, visible))))
                .containsEntry("accepted", true);
        verify(images).signDisplay(visible);
        verify(events).publishCreation(4L, "creation.updated", visible);
        verifyNoMoreInteractions(images, events);
    }
}
