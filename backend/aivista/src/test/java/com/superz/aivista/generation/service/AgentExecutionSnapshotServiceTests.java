package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.ConversationMessage;
import com.superz.aivista.generation.entity.AgentSessionContext;
import com.superz.aivista.generation.entity.CreationForm;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.ConversationMessageMapper;
import com.superz.aivista.generation.mapper.CreationTaskInputAssetMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.AgentSessionContextMapper;
import com.superz.aivista.generation.mapper.CreationFormMapper;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class AgentExecutionSnapshotServiceTests {
    @Test
    void returnsPromptAndOrderedSafeInputObjects() {
        CreationTaskMapper creations = mock(CreationTaskMapper.class);
        ConversationMessageMapper messages = mock(ConversationMessageMapper.class);
        CreationTaskInputAssetMapper inputs = mock(CreationTaskInputAssetMapper.class);
        ImageAssetMapper assets = mock(ImageAssetMapper.class);
        AgentSessionContextMapper contexts = mock(AgentSessionContextMapper.class);
        CreationTask creation = new CreationTask();
        creation.setId(151L);
        creation.setSessionId(101L);
        creation.setMode("AGENT");
        creation.setRequestedAspectRatio("3:4");
        creation.setRequestedImageCount(3);
        creation.setStatus("RUNNING");
        creation.setRevision(0L);
        ConversationMessage user = new ConversationMessage();
        user.setContent("把这张图改成海报");
        user.setSequenceNo(5);
        ImageAsset generated = asset(501L, "GENERATED", "users/7/tasks/20/0", "image/png");
        ImageAsset uploaded = asset(502L, "UPLOADED", "users/7/uploads/x/original.jpg", "image/jpeg");
        when(creations.selectSnapshotById(151L)).thenReturn(creation);
        when(messages.selectUserByCreationTaskId(151L)).thenReturn(user);
        AgentSessionContext context = new AgentSessionContext();
        context.setSessionId(101L);
        context.setContextJson(
                "{\"schemaVersion\":1,\"compaction\":null,\"messages\":[{\"role\":\"user\",\"content\":\"上一轮请求\"}]}");
        when(contexts.selectBySessionId(101L)).thenReturn(context);
        when(inputs.selectAssetIdsByCreationTaskId(151L)).thenReturn(List.of(502L, 501L));
        when(assets.selectByAssetIds(List.of(502L, 501L))).thenReturn(List.of(generated, uploaded));

        var snapshot = new AgentExecutionSnapshotService(creations, messages, inputs, assets,
                contexts, mock(CreationFormMapper.class), new ObjectMapper()).get(151L);

        assertThat(snapshot.prompt()).isEqualTo("把这张图改成海报");
        assertThat(snapshot.contractVersion()).isEqualTo(4);
        var contextMessages = (List<?>) snapshot.agentContext().get("messages");
        assertThat(((java.util.Map<?, ?>) contextMessages.getFirst()).get("content")).isEqualTo("上一轮请求");
        assertThat(snapshot.inputAssets()).extracting(asset -> asset.assetId())
                .containsExactly("502", "501");
        assertThat(snapshot.inputAssets().get(0).objectKey()).isEqualTo("users/7/uploads/x/original.jpg");
        assertThat(snapshot.inputAssets().get(0).contentType()).isEqualTo("image/jpeg");
        assertThat(snapshot.inputAssets().get(1).objectKey()).isEqualTo("users/7/tasks/20/0/display.webp");
        assertThat(snapshot.inputAssets().get(1).contentType()).isEqualTo("image/webp");
        assertThat(snapshot.constraints().aspectRatio()).isEqualTo("3:4");
        assertThat(snapshot.constraints().imageCount()).isEqualTo(3);
        assertThat(snapshot.pendingInput()).isNull();
    }

    @Test
    void returnsCancelledPendingInputFromAnEarlierCreationInTheSession() {
        CreationTaskMapper creations = mock(CreationTaskMapper.class);
        ConversationMessageMapper messages = mock(ConversationMessageMapper.class);
        CreationTaskInputAssetMapper inputs = mock(CreationTaskInputAssetMapper.class);
        ImageAssetMapper assets = mock(ImageAssetMapper.class);
        AgentSessionContextMapper contexts = mock(AgentSessionContextMapper.class);
        CreationFormMapper forms = mock(CreationFormMapper.class);
        CreationTask current = creation();
        current.setId(152L);
        current.setRequestedAspectRatio("AUTO");
        current.setRequestedImageCount(0);
        ConversationMessage user = new ConversationMessage();
        user.setContent("重新开始");
        AgentSessionContext context = new AgentSessionContext();
        context.setSessionId(101L);
        context.setContextJson("{\"schemaVersion\":1,\"compaction\":null,\"messages\":[]}");
        context.setSnapshotCreationTaskId(151L);
        context.setSnapshotRevision(6L);
        context.setPendingToolCallId("call-form-1");
        context.setPendingInputStatus("CANCELLED");
        CreationForm form = new CreationForm();
        form.setCreationTaskId(151L);
        form.setToolCallId("call-form-1");
        form.setStatus("SUBMITTED");
        form.setFormJson("{\"schemaVersion\":1,\"title\":\"确认需求\",\"fields\":["
                + "{\"id\":\"subject\",\"type\":\"TEXT\",\"label\":\"主题\",\"required\":true}]}");
        form.setAnswerJson("{\"subject\":{\"kind\":\"TEXT\",\"value\":\"旧答案\"}}");
        when(creations.selectSnapshotById(152L)).thenReturn(current);
        when(messages.selectUserByCreationTaskId(152L)).thenReturn(user);
        when(inputs.selectAssetIdsByCreationTaskId(152L)).thenReturn(List.of());
        when(contexts.selectBySessionId(101L)).thenReturn(context);
        when(forms.selectByToolCall(151L, "call-form-1")).thenReturn(form);

        var snapshot = new AgentExecutionSnapshotService(creations, messages, inputs, assets,
                contexts, forms, new ObjectMapper()).get(152L);

        assertThat(snapshot.pendingInput().creationId()).isEqualTo("151");
        assertThat(snapshot.pendingInput().toolCallId()).isEqualTo("call-form-1");
        assertThat(snapshot.pendingInput().status()).isEqualTo("CANCELLED");
        assertThat(snapshot.pendingInput().form().get("title")).isEqualTo("确认需求");
        assertThat(snapshot.pendingInput().answers()).isNull();
    }

    @Test
    void resolvesOnlyAnImageAuthorizedByTheCurrentRunningAgentSession() {
        CreationTaskMapper creations = mock(CreationTaskMapper.class);
        ConversationMessageMapper messages = mock(ConversationMessageMapper.class);
        CreationTaskInputAssetMapper inputs = mock(CreationTaskInputAssetMapper.class);
        ImageAssetMapper assets = mock(ImageAssetMapper.class);
        AgentSessionContextMapper contexts = mock(AgentSessionContextMapper.class);
        CreationTask creation = creation();
        ImageAsset generated = asset(701L, "GENERATED", "users/7/tasks/31/0", "image/png");
        when(creations.selectSnapshotById(151L)).thenReturn(creation);
        when(assets.selectReadableByAgentSession(701L, 7L, 101L)).thenReturn(generated);

        var result = new AgentExecutionSnapshotService(creations, messages, inputs, assets,
                contexts, mock(CreationFormMapper.class), new ObjectMapper()).resolveImage(151L, 3L, 701L);

        assertThat(result.assetId()).isEqualTo("701");
        assertThat(result.objectKey()).isEqualTo("users/7/tasks/31/0/display.webp");
        assertThat(result.contentType()).isEqualTo("image/webp");
    }

    @Test
    void rejectsImageResolutionAfterTheAgentRevisionChanges() {
        CreationTaskMapper creations = mock(CreationTaskMapper.class);
        CreationTask creation = creation();
        when(creations.selectSnapshotById(151L)).thenReturn(creation);
        var service = new AgentExecutionSnapshotService(creations, mock(ConversationMessageMapper.class),
                mock(CreationTaskInputAssetMapper.class), mock(ImageAssetMapper.class),
                mock(AgentSessionContextMapper.class), mock(CreationFormMapper.class), new ObjectMapper());

        assertThatThrownBy(() -> service.resolveImage(151L, 2L, 701L))
                .isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.AGENT_CREATION_NOT_RUNNING));
    }

    private static CreationTask creation() {
        CreationTask creation = new CreationTask();
        creation.setId(151L);
        creation.setUserId(7L);
        creation.setSessionId(101L);
        creation.setMode("AGENT");
        creation.setStatus("RUNNING");
        creation.setRevision(3L);
        return creation;
    }

    private static ImageAsset asset(long id, String origin, String key, String contentType) {
        ImageAsset asset = new ImageAsset();
        asset.setId(id);
        asset.setOrigin(origin);
        asset.setObjectKey(key);
        asset.setOriginalObjectKey(key);
        asset.setContentType(contentType);
        asset.setFileSize(100L);
        asset.setWidth(100);
        asset.setHeight(200);
        return asset;
    }
}
