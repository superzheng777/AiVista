package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.superz.aivista.generation.config.GenerationWorkerApiProperties;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class CreationRuntimeStreamServiceTests {
    @Test @SuppressWarnings("unchecked")
    void imageSettlementCannotRetireRouteBeforeFinalParentEvent() {
        var jdbc = mock(JdbcTemplate.class);
        var users = mock(UserEventConnections.class);
        var images = mock(CreationImageService.class);
        when(images.signDisplay(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(0);
        var service = new CreationRuntimeStreamService("http://127.0.0.1:1",
            new GenerationWorkerApiProperties("test"), users, images, jdbc, new JsonMapper());
        try {
            // Construct an idle route without establishing an unrelated network connection.
            var type = java.util.Arrays.stream(CreationRuntimeStreamService.class.getDeclaredClasses())
                .filter(value -> value.getSimpleName().equals("Channel")).findFirst().orElseThrow();
            var constructor = type.getDeclaredConstructor(CreationRuntimeStreamService.class, long.class);
            constructor.setAccessible(true);
            Object channel = constructor.newInstance(service, 1L);
            var routes = (Map<Long, Object>) ReflectionTestUtils.getField(service, "channels");
            routes.put(1L, channel);
            var ids = (Set<String>) ReflectionTestUtils.getField(channel, "ids");
            ids.add("21");
            ReflectionTestUtils.invokeMethod(channel, "receive", """
                {"type":"creation.item.upserted","userId":"1","creationId":"21",
                 "item":{"kind":"generation","status":"SUCCEEDED"}}
                """);
            assertThat(ids).contains("21");
            ReflectionTestUtils.invokeMethod(channel, "receive", """
                {"type":"creation.item.upserted","userId":"1","creationId":"21",
                 "item":{"kind":"text","phase":"final","text":"完成"}}
                """);
            ReflectionTestUtils.invokeMethod(channel, "receive", """
                {"type":"creation.updated","userId":"1","creationId":"21","status":"SUCCEEDED"}
                """);
            assertThat(routes).isEmpty();
            verify(users, times(3)).broadcast(eq(1L), any(JsonNode.class));
            // Deletion removes only this session's routes; queued late events must be ignored.
            Object otherChannel = constructor.newInstance(service, 1L);
            routes.put(1L, otherChannel);
            var otherIds = (Set<String>) ReflectionTestUtils.getField(otherChannel, "ids");
            otherIds.addAll(java.util.List.of("31", "32"));
            when(jdbc.queryForList(anyString(), eq(Long.class), eq(1L), eq(7L))).thenReturn(java.util.List.of(31L));
            service.forgetSession(1, 7);
            assertThat(otherIds).containsExactly("32");
            ReflectionTestUtils.invokeMethod(otherChannel, "receive", """
                {"type":"creation.updated","userId":"1","creationId":"31","status":"SUCCEEDED"}
                """);
            verify(users, times(3)).broadcast(eq(1L), any(JsonNode.class));
        } catch (ReflectiveOperationException exception) { throw new AssertionError(exception); }
        finally { service.close(); }
    }
}
