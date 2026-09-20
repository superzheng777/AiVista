package com.superz.aivista.generation.api;

import com.superz.aivista.generation.config.GenerationWorkerApiProperties;
import com.superz.aivista.generation.message.GenerationCompletionCommand;
import com.superz.aivista.generation.message.GenerationCompletionResponse;
import com.superz.aivista.generation.message.GenerationPhaseCommand;
import com.superz.aivista.generation.message.GenerationPhaseResponse;
import com.superz.aivista.generation.dto.CreateAgentGenerationTaskRequest;
import com.superz.aivista.generation.dto.CreateGenerationTaskResponse;
import com.superz.aivista.generation.service.AgentGenerationTaskCreationService;
import com.superz.aivista.generation.service.GenerationCompletionService;
import com.superz.aivista.generation.service.GenerationPhaseService;
import com.superz.aivista.generation.service.AgentExecutionSnapshotService;
import com.superz.aivista.generation.message.AgentExecutionSnapshot;
import com.superz.aivista.generation.message.AgentCompletionCommand;
import com.superz.aivista.generation.service.AgentCompletionService;
import com.superz.aivista.generation.service.AgentRealtimeProjectionService;
import com.superz.aivista.generation.service.AgentFormService;
import com.superz.aivista.generation.message.AgentInputRequestCommand;
import org.springframework.http.ResponseEntity;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.server.ResponseStatusException;

/** Private worker callbacks; never exposed as a browser API. */
@RestController
@RequestMapping("/internal/generation-worker")
public class GenerationWorkerController {
    private static final String TOKEN_HEADER = "X-AiVista-Worker-Token";
    private final GenerationCompletionService completions;
    private final GenerationWorkerApiProperties properties;
    private final AgentGenerationTaskCreationService agentTasks;
    private final AgentExecutionSnapshotService agentSnapshots;
    private final AgentCompletionService agentCompletions;
    private final AgentRealtimeProjectionService agentRealtime;
    private final GenerationPhaseService phases;
    private final AgentFormService forms;

    public GenerationWorkerController(GenerationCompletionService completions,
            GenerationWorkerApiProperties properties, AgentGenerationTaskCreationService agentTasks,
            AgentExecutionSnapshotService agentSnapshots, AgentCompletionService agentCompletions,
            AgentRealtimeProjectionService agentRealtime,
            GenerationPhaseService phases, AgentFormService forms) {
        this.completions = completions;
        this.properties = properties;
        this.agentTasks = agentTasks;
        this.agentSnapshots = agentSnapshots;
        this.agentCompletions = agentCompletions;
        this.agentRealtime = agentRealtime;
        this.phases = phases;
        this.forms = forms;
    }

    @PutMapping("/agent-creations/{creationId}/forms/{toolCallId}")
    public ResponseEntity<Void> requestAgentInput(
            @RequestHeader(TOKEN_HEADER) String token, @PathVariable long creationId,
            @PathVariable String toolCallId, @RequestBody AgentInputRequestCommand command) {
        authenticate(token);
        var result = forms.request(creationId, toolCallId, command);
        if (result.created()) agentRealtime.publishFormRequested(creationId, result.revision(), result.form());
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.NO_CONTENT).build();
    }

    @GetMapping("/agent-creations/{creationId}/execution")
    public AgentExecutionSnapshot getAgentExecution(@RequestHeader(TOKEN_HEADER) String token,
            @PathVariable long creationId) {
        authenticate(token);
        return agentSnapshots.get(creationId);
    }

    @GetMapping("/agent-creations/{creationId}/assets/{assetId}")
    public AgentExecutionSnapshot.InputAsset getAgentImage(@RequestHeader(TOKEN_HEADER) String token,
            @PathVariable long creationId, @PathVariable long assetId,
            @RequestParam long expectedRevision) {
        authenticate(token);
        return agentSnapshots.resolveImage(creationId, expectedRevision, assetId);
    }

    @PutMapping("/agent-creations/{creationId}/completion")
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.NO_CONTENT)
    public void completeAgent(@RequestHeader(TOKEN_HEADER) String token,
            @PathVariable long creationId, @RequestBody AgentCompletionCommand command) {
        authenticate(token);
        if (!Long.toString(creationId).equals(command.creationId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Agent creation path does not match body");
        }
        agentCompletions.complete(command);
        agentRealtime.publishTerminal(creationId, command.expectedRevision());
    }

    @PutMapping("/tasks/{generationTaskId}/completion")
    public GenerationCompletionResponse complete(@RequestHeader(TOKEN_HEADER) String token,
            @PathVariable long generationTaskId, @RequestBody GenerationCompletionCommand command) {
        authenticate(token);
        if (!Long.toString(generationTaskId).equals(command.generationTaskId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Generation task path does not match body");
        }
        return completions.complete(command);
    }

    @GetMapping("/tasks/{generationTaskId}/completion")
    public GenerationCompletionResponse getCompletion(@RequestHeader(TOKEN_HEADER) String token,
            @PathVariable long generationTaskId) {
        authenticate(token);
        return completions.get(generationTaskId);
    }

    @PutMapping("/tasks/{generationTaskId}/phase")
    public GenerationPhaseResponse reportPhase(@RequestHeader(TOKEN_HEADER) String token,
            @PathVariable long generationTaskId, @RequestBody GenerationPhaseCommand command) {
        authenticate(token);
        return phases.report(generationTaskId, command.phase());
    }

    @PutMapping("/agent-creations/{creationId}/generation-tasks/{toolCallId}")
    public CreateGenerationTaskResponse createAgentGenerationTask(
            @RequestHeader(TOKEN_HEADER) String token,
            @PathVariable long creationId,
            @PathVariable String toolCallId,
            @RequestBody CreateAgentGenerationTaskRequest request) {
        authenticate(token);
        return agentTasks.create(creationId, toolCallId, request);
    }

    private void authenticate(String supplied) {
        String expected = properties.token();
        if (expected == null || expected.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Worker API is not configured");
        }
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid worker token");
        }
    }
}
