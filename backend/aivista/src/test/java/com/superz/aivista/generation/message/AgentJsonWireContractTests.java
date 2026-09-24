package com.superz.aivista.generation.message;

import static org.assertj.core.api.Assertions.assertThat;

import com.superz.aivista.generation.dto.CreationFormResponse;
import com.superz.aivista.generation.dto.ResolveCreationFormRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class AgentJsonWireContractTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void jacksonThreeDeserializesDynamicAgentRequestObjects() throws Exception {
        String json = """
                {"contractVersion":2,"expectedRevision":0,
                 "agentContext":{"schemaVersion":1,"compaction":null,"messages":[]},
                 "form":{"schemaVersion":1,"title":"确认需求","fields":[]},"activities":[]}
                """;

        AgentInputRequestCommand command = mapper.readValue(json, AgentInputRequestCommand.class);

        assertThat(command.agentContext()).containsEntry("schemaVersion", 1);
        assertThat(command.form()).containsEntry("title", "确认需求");
    }

    @Test
    void jacksonThreeDeserializesCompletionAndBrowserAnswers() throws Exception {
        AgentCompletionCommand completion = mapper.readValue("""
                {"contractVersion":2,"creationId":"6","expectedRevision":2,"outcome":"SUCCEEDED",
                 "failureCode":null,"finalMessage":"完成","activities":[],
                 "agentContext":{"schemaVersion":1,"compaction":null,"messages":[]}}
                """, AgentCompletionCommand.class);
        ResolveCreationFormRequest response = mapper.readValue("""
                {"expectedRevision":1,"action":"SUBMIT",
                 "answers":{"subject":{"kind":"TEXT","value":"雾灯岛"}}}
                """, ResolveCreationFormRequest.class);

        assertThat(completion.agentContext()).containsEntry("schemaVersion", 1);
        assertThat(response.answers()).containsKey("subject");
    }

    @Test
    void jacksonThreeSerializesDynamicAgentResponseObjects() throws Exception {
        var form = new CreationFormResponse("7", "call-1", "PENDING",
                Map.of("schemaVersion", 1, "title", "确认需求", "fields", List.of()), null,
                Instant.parse("2026-09-23T00:00:00Z"), null);
        var snapshot = new AgentExecutionSnapshot(4, "6", 1, "WAITING_INPUT", "6", "生成海报",
                Map.of("schemaVersion", 1, "compaction", Map.of(), "messages", List.of()), List.of(),
                new AgentExecutionSnapshot.GenerationConstraints("3:4", 1),
                new AgentExecutionSnapshot.PendingInput("6", "call-1", "PENDING", form.form(), null));

        String json = mapper.writeValueAsString(snapshot);

        assertThat(json).contains("\"agentContext\"", "\"pendingInput\"", "\"确认需求\"");
    }
}
