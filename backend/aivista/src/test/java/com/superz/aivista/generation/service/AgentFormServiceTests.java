package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.ResolveCreationFormRequest;
import com.superz.aivista.generation.entity.CreationForm;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.AgentSessionContextMapper;
import com.superz.aivista.generation.mapper.CreationFormMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.message.AgentInputRequestCommand;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AgentFormServiceTests {
    private static final Instant NOW = Instant.parse("2026-09-20T01:00:00Z");
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CreationTaskMapper creations = mock(CreationTaskMapper.class);
    private final CreationFormMapper forms = mock(CreationFormMapper.class);
    private final OutboxEventMapper outbox = mock(OutboxEventMapper.class);
    private final GenerationSessionMapper sessions = mock(GenerationSessionMapper.class);
    private final AgentActivityService activities = mock(AgentActivityService.class);
    private final AgentSessionContextMapper contexts = mock(AgentSessionContextMapper.class);
    private final AgentFormService service = new AgentFormService(creations, forms, outbox, sessions, activities,
            contexts, new AgentFormSchemaValidator(), objectMapper, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void persistsFormAndAtomicallyPausesCreation() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("RUNNING", 0));
        when(creations.pauseForInput(151L, 0L, NOW)).thenReturn(1);
        doAnswer(invocation -> {
            invocation.getArgument(0, CreationForm.class).setId(701L);
            return 1;
        }).when(forms).insertForm(any(CreationForm.class));

        var result = service.request(151L, "call-form-1",
                new AgentInputRequestCommand(2, 0, map(context()), map(form()), List.of()));

        assertThat(result.created()).isTrue();
        assertThat(result.revision()).isEqualTo(1);
        assertThat(result.form().status()).isEqualTo("PENDING");
        assertThat(result.form().toolCallId()).isEqualTo("call-form-1");
        verify(activities).persistLocked(151L, List.of());
        verify(contexts).upsertPending(101L, write(context()), 151L, 1L, "call-form-1", NOW);
        verify(creations).pauseForInput(151L, 0L, NOW);
    }

    @Test
    void returnsTheExistingFormForAnIdenticalToolRetryWithoutPausingAgain() {
        CreationTask creation = creation("WAITING_INPUT", 1);
        CreationForm form = pendingForm();
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation);
        when(forms.selectByToolCallForUpdate(151L, "call-form-1")).thenReturn(form);

        var result = service.request(151L, "call-form-1",
                new AgentInputRequestCommand(2, 0, map(context()), map(form()), List.of()));

        assertThat(result.created()).isFalse();
        assertThat(result.revision()).isEqualTo(1);
        assertThat(result.form().status()).isEqualTo("PENDING");
        verify(forms, never()).insertForm(any());
        verify(activities, never()).persistLocked(151L, List.of());
        verify(contexts, never()).upsertPending(101L, write(context()), 151L, 1L, "call-form-1", NOW);
        verify(creations, never()).pauseForInput(151L, 0L, NOW);
    }

    @Test
    void rejectsAChangedValueOnADuplicatePendingToolRequest() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("WAITING_INPUT", 1));
        when(forms.selectByToolCallForUpdate(151L, "call-form-1")).thenReturn(pendingForm());

        assertThatThrownBy(() -> service.request(151L, "call-form-1",
                new AgentInputRequestCommand(2, 0, map(context()), map(submittedForm()), List.of())))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.AGENT_FORM_CONFLICT));
    }

    @Test
    void submitsTheFilledFormAndCreatesOneResumeOutboxCommand() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("WAITING_INPUT", 1));
        when(forms.selectByIdForUpdate(701L)).thenReturn(pendingForm());
        when(forms.resolvePending(701L, "SUBMITTED", write(submittedForm()), NOW))
                .thenReturn(1);
        when(contexts.transitionPending(101L, 151L, 1L, 2L, "call-form-1",
                "PENDING", "SUBMITTED", NOW)).thenReturn(1);
        when(creations.resumeAfterInput(151L, 1L, NOW)).thenReturn(1);

        var result = service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SUBMIT", map(submittedForm())));

        assertThat(result.transitioned()).isTrue();
        assertThat(result.response().revision()).isEqualTo(2);
        assertThat(result.response().form().status()).isEqualTo("SUBMITTED");
        assertThat(result.response().form().form()).isEqualTo(map(submittedForm()));
        verify(contexts).transitionPending(101L, 151L, 1L, 2L, "call-form-1",
                "PENDING", "SUBMITTED", NOW);
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outbox).insertSelective(event.capture());
        assertThat(event.getValue()).extracting(OutboxEvent::getEventType, OutboxEvent::getAggregateVersion)
                .containsExactly("AGENT_EXECUTE", 2L);
        verify(sessions).updateLastMessageAt(101L, NOW);
    }

    @Test
    void skipsWithoutAFormAndCreatesOneResumeOutboxCommand() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("WAITING_INPUT", 1));
        when(forms.selectByIdForUpdate(701L)).thenReturn(pendingForm());
        when(forms.resolvePending(701L, "SKIPPED", null, NOW)).thenReturn(1);
        when(contexts.transitionPending(101L, 151L, 1L, 2L, "call-form-1",
                "PENDING", "SKIPPED", NOW)).thenReturn(1);
        when(creations.resumeAfterInput(151L, 1L, NOW)).thenReturn(1);

        var result = service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SKIP", null));

        assertThat(result.transitioned()).isTrue();
        assertThat(result.response().revision()).isEqualTo(2);
        assertThat(result.response().form().status()).isEqualTo("SKIPPED");
        assertThat(result.response().form().form()).isEqualTo(map(form()));
        verify(outbox).insertSelective(any(OutboxEvent.class));
    }

    @Test
    void returnsTheExistingSkippedResponseForAnIdenticalRetry() {
        CreationForm form = pendingForm();
        form.setStatus("SKIPPED");
        form.setResolvedAt(NOW);
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("RUNNING", 2));
        when(forms.selectByIdForUpdate(701L)).thenReturn(form);

        var result = service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SKIP", null));

        assertThat(result.transitioned()).isFalse();
        assertThat(result.response().form().status()).isEqualTo("SKIPPED");
        verify(outbox, never()).insertSelective(any());
    }

    @Test
    void returnsTheExistingResponseForAnIdenticalRetryWithoutAnotherCommand() {
        CreationTask creation = creation("RUNNING", 2);
        CreationForm form = pendingForm();
        form.setStatus("SUBMITTED");
        form.setFormJson(write(submittedForm()));
        form.setResolvedAt(NOW);
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation);
        when(forms.selectByIdForUpdate(701L)).thenReturn(form);

        var result = service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SUBMIT", map(submittedForm())));

        assertThat(result.transitioned()).isFalse();
        assertThat(result.response().revision()).isEqualTo(2);
        verify(outbox, never()).insertSelective(any());
    }

    @Test
    void rejectsASubmittedRetryWithADifferentValue() {
        CreationForm form = pendingForm();
        form.setStatus("SUBMITTED");
        form.setFormJson(write(submittedForm()));
        form.setResolvedAt(NOW);
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("RUNNING", 2));
        when(forms.selectByIdForUpdate(701L)).thenReturn(form);

        assertThatThrownBy(() -> service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SUBMIT", map(form()))))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.AGENT_FORM_CONFLICT));
    }

    @Test
    void rejectsARetryWithADifferentResolveAction() {
        CreationForm form = pendingForm();
        form.setStatus("SUBMITTED");
        form.setFormJson(write(submittedForm()));
        form.setResolvedAt(NOW);
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("RUNNING", 2));
        when(forms.selectByIdForUpdate(701L)).thenReturn(form);

        assertThatThrownBy(() -> service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SKIP", null)))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.AGENT_FORM_CONFLICT));
    }

    @Test
    void acceptsTheOriginalToolRetryAfterTheSubmittedValueReplacedTheStoredValue() {
        CreationTask creation = creation("RUNNING", 2);
        CreationForm stored = pendingForm();
        stored.setStatus("SUBMITTED");
        stored.setFormJson(write(submittedForm()));
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation);
        when(forms.selectByToolCallForUpdate(151L, "call-form-1")).thenReturn(stored);

        var result = service.request(151L, "call-form-1",
                new AgentInputRequestCommand(2, 0, map(context()), map(form()), List.of()));

        assertThat(result.created()).isFalse();
        assertThat(result.form().status()).isEqualTo("SUBMITTED");
    }

    @Test
    void rejectsChangesToTheFormDefinitionAtTheJavaTrustBoundary() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("WAITING_INPUT", 1));
        when(forms.selectByIdForUpdate(701L)).thenReturn(pendingForm());
        JsonNode changed = submittedForm();
        ((com.fasterxml.jackson.databind.node.ObjectNode) changed.path("fields").get(0))
                .put("label", "被篡改的标签");

        assertThatThrownBy(() -> service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SUBMIT", map(changed))))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void rejectsABlankRequiredValueAtTheJavaTrustBoundary() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("WAITING_INPUT", 1));
        when(forms.selectByIdForUpdate(701L)).thenReturn(pendingForm());
        JsonNode blank = submittedForm();
        ((com.fasterxml.jackson.databind.node.ObjectNode) blank.path("fields").get(0)).put("value", "  ");

        assertThatThrownBy(() -> service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SUBMIT", map(blank))))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void allowsARequiredFieldToStartBlankWhileTheFormIsPending() {
        JsonNode pending = form();
        ((com.fasterxml.jackson.databind.node.ObjectNode) pending.path("fields").get(0)).put("value", "");

        assertThat(new AgentFormSchemaValidator().validateForm(pending)).isEqualTo(pending);
    }

    @Test
    void acceptsACustomSingleSelectValueOnlyWhenEnabled() {
        var customField = objectMapper.createObjectNode()
                .put("id", "style").put("type", "SINGLE_SELECT").put("label", "风格")
                .put("required", true).put("value", "清透但带颗粒感")
                .put("allowCustom", true).put("customLabel", "自定义");
        customField.set("options", objectMapper.createArrayNode()
                .add(objectMapper.createObjectNode().put("value", "FRESH").put("label", "清新"))
                .add(objectMapper.createObjectNode().put("value", "RETRO").put("label", "复古")));
        var custom = objectMapper.createObjectNode().put("schemaVersion", 2).put("title", "确认风格");
        custom.set("fields", objectMapper.createArrayNode().add(customField));

        assertThat(new AgentFormSchemaValidator().validateSubmission(custom, custom)).isEqualTo(custom);

        JsonNode disabled = custom.deepCopy();
        var field = (com.fasterxml.jackson.databind.node.ObjectNode) disabled.path("fields").get(0);
        field.put("allowCustom", false).remove("customLabel");
        assertThatThrownBy(() -> new AgentFormSchemaValidator().validateForm(disabled))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void rejectsFormContentWhenSkipping() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("WAITING_INPUT", 1));
        when(forms.selectByIdForUpdate(701L)).thenReturn(pendingForm());

        assertThatThrownBy(() -> service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SKIP", map(form()))))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void rejectsSubmissionWithoutAForm() {
        when(creations.selectByIdForUpdate(151L)).thenReturn(creation("WAITING_INPUT", 1));
        when(forms.selectByIdForUpdate(701L)).thenReturn(pendingForm());

        assertThatThrownBy(() -> service.resolve(7L, 151L, 701L,
                new ResolveCreationFormRequest(1L, "SUBMIT", null)))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void rejectsAStringSchemaVersionAtTheJavaTrustBoundary() {
        JsonNode invalid = form().deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) invalid).put("schemaVersion", "2");

        assertThatThrownBy(() -> new AgentFormSchemaValidator().validateForm(invalid))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    @Test
    void rejectsTheLegacyInputContractWithoutAnAgentContext() {
        assertThatThrownBy(() -> service.request(151L, "call-form-1",
                new AgentInputRequestCommand(1, 0, null, map(form()), List.of())))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR));
    }

    private CreationForm pendingForm() {
        CreationForm form = new CreationForm();
        form.setId(701L);
        form.setCreationTaskId(151L);
        form.setToolCallId("call-form-1");
        form.setStatus("PENDING");
        form.setFormJson(write(form()));
        form.setRequestedAt(NOW);
        return form;
    }

    private CreationTask creation(String status, long revision) {
        CreationTask creation = new CreationTask();
        creation.setId(151L);
        creation.setUserId(7L);
        creation.setSessionId(101L);
        creation.setMode("AGENT");
        creation.setStatus(status);
        creation.setRevision(revision);
        return creation;
    }

    private JsonNode form() {
        return objectMapper.createObjectNode().put("schemaVersion", 2).put("title", "确认海报方向")
                .set("fields", objectMapper.createArrayNode().add(objectMapper.createObjectNode()
                        .put("id", "subject").put("type", "TEXT").put("label", "主题")
                        .put("required", true).put("value", "关爱流浪动物")));
    }

    private JsonNode submittedForm() {
        JsonNode submitted = form().deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) submitted.path("fields").get(0))
                .put("value", "关爱流浪猫");
        return submitted;
    }

    private JsonNode context() {
        return objectMapper.createObjectNode().put("schemaVersion", 1).putNull("compaction")
                .set("messages", objectMapper.createArrayNode());
    }

    private String write(JsonNode value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(JsonNode value) {
        return objectMapper.convertValue(value, Map.class);
    }
}
