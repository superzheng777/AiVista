package com.superz.aivista.generation.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.CreationFormResponse;
import com.superz.aivista.generation.dto.ResolveCreationFormRequest;
import com.superz.aivista.generation.dto.ResolveCreationFormResponse;
import com.superz.aivista.generation.entity.CreationForm;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.AgentSessionContextMapper;
import com.superz.aivista.generation.mapper.CreationFormMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.message.AgentInputRequestCommand;
import com.superz.aivista.generation.model.AgentJsonObjects;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Owns the persistent form fact and the RUNNING ↔ WAITING_INPUT transitions. */
@Service
public class AgentFormService {
    private final CreationTaskMapper creations;
    private final CreationFormMapper forms;
    private final OutboxEventMapper outbox;
    private final GenerationSessionMapper sessions;
    private final AgentActivityService activities;
    private final AgentSessionContextMapper contexts;
    private final AgentFormSchemaValidator validator;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public AgentFormService(CreationTaskMapper creations, CreationFormMapper forms, OutboxEventMapper outbox,
            GenerationSessionMapper sessions, AgentActivityService activities,
            AgentSessionContextMapper contexts, AgentFormSchemaValidator validator,
            ObjectMapper objectMapper, Clock clock) {
        this.creations = creations;
        this.forms = forms;
        this.outbox = outbox;
        this.sessions = sessions;
        this.activities = activities;
        this.contexts = contexts;
        this.validator = validator;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional
    public InputRequestResult request(long creationTaskId, String toolCallId, AgentInputRequestCommand command) {
        if (command == null || command.contractVersion() != 2 || command.expectedRevision() < 0
                || toolCallId == null || toolCallId.isBlank() || toolCallId.length() > 128
                || command.activities() == null || command.activities().size() > 100) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR);
        }
        JsonNode agentContext = AgentJsonObjects.toTree(objectMapper, command.agentContext());
        if (!validContext(agentContext)) throw new BusinessException(ErrorCode.VALIDATION_ERROR);
        JsonNode normalizedForm = validator.validateForm(AgentJsonObjects.toTree(objectMapper, command.form()));
        CreationTask creation = requireAgentCreation(creationTaskId);
        CreationForm existing = forms.selectByToolCallForUpdate(creationTaskId, toolCallId);
        if (existing != null) {
            if (!readJson(existing.getFormJson()).equals(normalizedForm)) {
                throw new BusinessException(ErrorCode.AGENT_FORM_CONFLICT);
            }
            return new InputRequestResult(creation.getRevision(), response(existing), false);
        }
        if (!"RUNNING".equals(creation.getStatus()) || creation.getRevision() == null
                || creation.getRevision() != command.expectedRevision()) {
            throw new BusinessException(ErrorCode.AGENT_FORM_CONFLICT);
        }
        activities.persistLocked(creationTaskId, command.activities());
        Instant now = clock.instant();
        CreationForm form = new CreationForm();
        form.setCreationTaskId(creationTaskId);
        form.setToolCallId(toolCallId);
        form.setStatus("PENDING");
        form.setFormJson(writeJson(normalizedForm));
        form.setRequestedAt(now);
        forms.insertForm(form);
        long nextRevision = command.expectedRevision() + 1;
        contexts.upsertPending(creation.getSessionId(), writeJson(agentContext), creationTaskId,
                nextRevision, toolCallId, now);
        if (creations.pauseForInput(creationTaskId, command.expectedRevision(), now) != 1) {
            throw new BusinessException(ErrorCode.AGENT_FORM_CONFLICT);
        }
        return new InputRequestResult(nextRevision, response(form), true);
    }

    @Transactional
    public ResolveResult resolve(long userId, long creationTaskId, long formId,
            ResolveCreationFormRequest request) {
        if (request == null || request.expectedRevision() == null || request.expectedRevision() < 0
                || !("SUBMIT".equals(request.action()) || "SKIP".equals(request.action()))) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR);
        }
        CreationTask creation = requireAgentCreation(creationTaskId);
        if (creation.getUserId() != userId) throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        CreationForm form = forms.selectByIdForUpdate(formId);
        if (form == null || !Objects.equals(form.getCreationTaskId(), creationTaskId)) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        JsonNode definition = readJson(form.getFormJson());
        JsonNode normalizedAnswers = validator.validateAnswers(definition, request.action(),
                AgentJsonObjects.toTree(objectMapper, request.answers()));
        String desiredStatus = "SUBMIT".equals(request.action()) ? "SUBMITTED" : "SKIPPED";
        if (!"PENDING".equals(form.getStatus())) {
            if (!desiredStatus.equals(form.getStatus())
                    || !Objects.equals(readJson(form.getAnswerJson()), normalizedAnswers)) {
                throw new BusinessException(ErrorCode.AGENT_FORM_CONFLICT);
            }
            return new ResolveResult(result(creation, form), false);
        }
        if (!"WAITING_INPUT".equals(creation.getStatus()) || creation.getRevision() == null
                || creation.getRevision().longValue() != request.expectedRevision().longValue()) {
            throw new BusinessException(ErrorCode.AGENT_FORM_NOT_PENDING);
        }
        Instant now = clock.instant();
        String answerJson = normalizedAnswers == null ? null : writeJson(normalizedAnswers);
        long nextRevision = request.expectedRevision() + 1;
        if (forms.resolvePending(formId, desiredStatus, answerJson, now) != 1
                || contexts.transitionPending(creation.getSessionId(), creationTaskId,
                        request.expectedRevision(), nextRevision, form.getToolCallId(), "PENDING", desiredStatus, now)
                        != 1
                || creations.resumeAfterInput(creationTaskId, request.expectedRevision(), now) != 1) {
            throw new BusinessException(ErrorCode.AGENT_FORM_NOT_PENDING);
        }
        insertExecuteCommand(creationTaskId, nextRevision, now);
        sessions.updateLastMessageAt(creation.getSessionId(), now);
        form.setStatus(desiredStatus);
        form.setAnswerJson(answerJson);
        form.setResolvedAt(now);
        creation.setRevision(nextRevision);
        creation.setStatus("RUNNING");
        return new ResolveResult(result(creation, form), true);
    }

    private CreationTask requireAgentCreation(long creationTaskId) {
        CreationTask creation = creations.selectByIdForUpdate(creationTaskId);
        if (creation == null || !"AGENT".equals(creation.getMode())) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        return creation;
    }

    private void insertExecuteCommand(long creationTaskId, long revision, Instant now) {
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.AGENT_EXECUTE.name());
        event.setAggregateType("CREATION_TASK");
        event.setAggregateId(creationTaskId);
        event.setAggregateVersion(revision);
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        outbox.insertSelective(event);
    }

    private ResolveCreationFormResponse result(CreationTask creation, CreationForm form) {
        return new ResolveCreationFormResponse(creation.getId().toString(), creation.getRevision(), response(form));
    }

    private CreationFormResponse response(CreationForm form) {
        return new CreationFormResponse(form.getId().toString(), form.getToolCallId(), form.getStatus(),
                AgentJsonObjects.read(objectMapper, form.getFormJson(), "Stored Agent form JSON"),
                AgentJsonObjects.read(objectMapper, form.getAnswerJson(), "Stored Agent answer JSON"),
                form.getRequestedAt(), form.getResolvedAt());
    }

    private static boolean validContext(JsonNode context) {
        return context != null && context.isObject()
                && context.path("schemaVersion").asInt(-1) == 1
                && (context.path("compaction").isNull() || context.path("compaction").isObject())
                && context.path("messages").isArray()
                && context.path("messages").size() <= 1_000;
    }

    private JsonNode readJson(String value) {
        if (value == null) return null;
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored Agent form JSON is invalid", exception);
        }
    }

    private String writeJson(JsonNode value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Agent JSON is invalid", exception);
        }
    }

    public record InputRequestResult(long revision, CreationFormResponse form, boolean created) {}
    public record ResolveResult(ResolveCreationFormResponse response, boolean transitioned) {}
}
