package com.superz.aivista.generation.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.mapper.AgentSessionContextMapper;
import com.superz.aivista.generation.mapper.ConversationMessageMapper;
import com.superz.aivista.generation.mapper.CreationTaskInputAssetMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.mapper.CreationFormMapper;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.message.AgentExecutionSnapshot;
import com.superz.aivista.generation.model.GenerationImageObjectKeys;
import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** 读取 Agent Worker 所需数据；不暴露用户凭据、签名 URL 或无关业务字段。 */
@Service
public class AgentExecutionSnapshotService {
    private final CreationTaskMapper creations;
    private final ConversationMessageMapper messages;
    private final CreationTaskInputAssetMapper creationInputs;
    private final ImageAssetMapper assets;
    private final AgentSessionContextMapper contexts;
    private final CreationFormMapper forms;
    private final ObjectMapper objectMapper;

    public AgentExecutionSnapshotService(CreationTaskMapper creations, ConversationMessageMapper messages,
            CreationTaskInputAssetMapper creationInputs, ImageAssetMapper assets,
            AgentSessionContextMapper contexts, CreationFormMapper forms, ObjectMapper objectMapper) {
        this.creations = creations;
        this.messages = messages;
        this.creationInputs = creationInputs;
        this.assets = assets;
        this.contexts = contexts;
        this.forms = forms;
        this.objectMapper = objectMapper;
    }

    public AgentExecutionSnapshot get(long creationTaskId) {
        var creation = creations.selectSnapshotById(creationTaskId);
        if (creation == null || !"AGENT".equals(creation.getMode())) {
            throw new IllegalArgumentException("Agent creation does not exist");
        }
        var userMessage = messages.selectUserByCreationTaskId(creationTaskId);
        if (userMessage == null || userMessage.getContent() == null) {
            throw new IllegalStateException("Agent creation user message is missing");
        }
        List<Long> ids = creationInputs.selectAssetIdsByCreationTaskId(creationTaskId);
        Map<Long, ImageAsset> byId = ids.isEmpty() ? Map.of() : assets.selectByAssetIds(ids).stream()
                .collect(Collectors.toMap(ImageAsset::getId, Function.identity()));
        List<AgentExecutionSnapshot.InputAsset> inputs = ids.stream()
                .map(id -> input(byId.get(id)))
                .toList();
        var resolvedForm = forms.selectLatestResolved(creationTaskId);
        return new AgentExecutionSnapshot(3, creation.getId().toString(), creation.getRevision(),
                creation.getStatus(), creation.getSessionId().toString(), userMessage.getContent(),
                readContext(creation.getSessionId()), inputs,
                new AgentExecutionSnapshot.GenerationConstraints(creation.getRequestedAspectRatio(),
                        creation.getRequestedImageCount()), resolvedForm == null ? null
                        : new AgentExecutionSnapshot.FormResponse(resolvedForm.getId().toString(),
                                resolvedForm.getStatus(), readJson(resolvedForm.getFormJson()),
                                readJson(resolvedForm.getAnswerJson())));
    }

    /** Resolves a stable Asset ID without exposing arbitrary user or OSS objects to the Agent. */
    public AgentExecutionSnapshot.InputAsset resolveImage(long creationTaskId, long expectedRevision, long assetId) {
        var creation = creations.selectSnapshotById(creationTaskId);
        if (creation == null || !"AGENT".equals(creation.getMode())) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        if (!"RUNNING".equals(creation.getStatus()) || creation.getRevision() == null
                || creation.getRevision() != expectedRevision) {
            throw new BusinessException(ErrorCode.AGENT_CREATION_NOT_RUNNING);
        }
        ImageAsset asset = assets.selectReadableByAgentSession(assetId, creation.getUserId(),
                creation.getSessionId());
        if (asset == null) throw new BusinessException(ErrorCode.MEDIA_FORBIDDEN);
        boolean generated = "GENERATED".equals(asset.getOrigin());
        String key = generated
                ? GenerationImageObjectKeys.fromStoredValue(asset.getObjectKey()).display()
                : asset.getOriginalObjectKey();
        String contentType = generated ? "image/webp" : asset.getContentType();
        return new AgentExecutionSnapshot.InputAsset(asset.getId().toString(), key, contentType,
                asset.getFileSize(), asset.getWidth(), asset.getHeight());
    }

    private JsonNode readContext(long sessionId) {
        String value = contexts.selectContextJson(sessionId);
        if (value == null) return null;
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored Agent session context is invalid", exception);
        }
    }

    private JsonNode readJson(String value) {
        if (value == null) return null;
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored Agent form JSON is invalid", exception);
        }
    }

    private static AgentExecutionSnapshot.InputAsset input(ImageAsset asset) {
        if (asset == null) throw new IllegalStateException("Agent creation input asset is missing");
        boolean generated = "GENERATED".equals(asset.getOrigin());
        String key = generated
                ? GenerationImageObjectKeys.fromStoredValue(asset.getObjectKey()).display()
                : asset.getOriginalObjectKey();
        String contentType = generated ? "image/webp" : asset.getContentType();
        return new AgentExecutionSnapshot.InputAsset(asset.getId().toString(), key, contentType,
                asset.getFileSize(), asset.getWidth(), asset.getHeight());
    }
}
