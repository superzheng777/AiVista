package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.GenerationTaskSnapshotResponse;
import com.superz.aivista.generation.entity.ConversationMessage;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.ConversationMessageMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationSessionTurnQueryServiceTests {
    @Test
    void returnsCreationTurnsInChronologicalOrderAndUsesTheOldestTaskAsCursor() {
        GenerationSessionMapper sessionMapper = mock(GenerationSessionMapper.class);
        ConversationMessageMapper messageMapper = mock(ConversationMessageMapper.class);
        CreationTaskMapper creationTaskMapper = mock(CreationTaskMapper.class);
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        ImageAssetMapper imageMapper = mock(ImageAssetMapper.class);
        GenerationTaskQueryService taskQueryService = mock(GenerationTaskQueryService.class);
        when(sessionMapper.selectOwnedById(201L, 7L)).thenReturn(new GenerationSession());
        when(creationTaskMapper.selectPageBySessionId(201L, null, 3))
                .thenReturn(List.of(creationTask(23), creationTask(22), creationTask(21)));
        when(messageMapper.selectByCreationTaskIds(List.of(22L, 23L)))
                .thenReturn(List.of(userMessage(22, 3), assistantMessage(22, 4),
                        userMessage(23, 5), assistantMessage(23, 6)));
        GenerationTask task2 = task(302, 22);
        GenerationTask task3 = task(303, 23);
        when(taskMapper.selectByCreationTaskIds(List.of(22L, 23L))).thenReturn(List.of(task2, task3));
        when(imageMapper.selectByOriginTaskIds(List.of(302L, 303L))).thenReturn(List.of());
        when(taskQueryService.snapshot(eq(task2), anyList())).thenReturn(snapshot("302"));
        when(taskQueryService.snapshot(eq(task3), anyList())).thenReturn(snapshot("303"));

        var response = service(sessionMapper, messageMapper, creationTaskMapper, taskMapper, imageMapper,
                taskQueryService).list(7L, 201L, null, 2);

        assertThat(response.hasMore()).isTrue();
        assertThat(response.nextBefore()).isEqualTo("MjI");
        assertThat(response.items()).extracting(item -> item.userMessage().sequenceNo()).containsExactly(3, 5);
        assertThat(response.items()).extracting(item -> item.assistantMessage().role())
                .containsOnly("ASSISTANT");
        assertThat(response.items()).extracting(item -> item.generation().taskId()).containsExactly("302", "303");
        verify(taskMapper).selectByCreationTaskIds(List.of(22L, 23L));
        verify(imageMapper).selectByOriginTaskIds(List.of(302L, 303L));
    }

    @Test
    void rejectsForeignSessionAndInvalidCursor() {
        GenerationSessionMapper sessionMapper = mock(GenerationSessionMapper.class);
        GenerationSessionTurnQueryService service = service(sessionMapper,
                mock(ConversationMessageMapper.class), mock(CreationTaskMapper.class),
                mock(GenerationTaskMapper.class), mock(ImageAssetMapper.class),
                mock(GenerationTaskQueryService.class));

        assertThatThrownBy(() -> service.list(7L, 201L, null, 20))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));

        when(sessionMapper.selectOwnedById(201L, 7L)).thenReturn(new GenerationSession());
        assertThatThrownBy(() -> service.list(7L, 201L, "bad-cursor", 5))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_CURSOR));
    }

    private static GenerationSessionTurnQueryService service(GenerationSessionMapper sessionMapper,
            ConversationMessageMapper messageMapper, CreationTaskMapper creationTaskMapper,
            GenerationTaskMapper taskMapper, ImageAssetMapper imageMapper,
            GenerationTaskQueryService taskQueryService) {
        return new GenerationSessionTurnQueryService(sessionMapper, messageMapper, creationTaskMapper,
                taskMapper, imageMapper, taskQueryService);
    }

    private static CreationTask creationTask(long id) {
        CreationTask task = new CreationTask();
        task.setId(id);
        return task;
    }

    private static ConversationMessage userMessage(long creationTaskId, int sequenceNo) {
        ConversationMessage message = new ConversationMessage();
        message.setId(creationTaskId + 100);
        message.setCreationTaskId(creationTaskId);
        message.setSequenceNo(sequenceNo);
        message.setRole("USER");
        message.setContent("prompt " + sequenceNo);
        message.setCreatedAt(Instant.parse("2026-07-30T00:00:00Z"));
        return message;
    }

    private static ConversationMessage assistantMessage(long creationTaskId, int sequenceNo) {
        ConversationMessage message = new ConversationMessage();
        message.setId(creationTaskId + 200);
        message.setCreationTaskId(creationTaskId);
        message.setSequenceNo(sequenceNo);
        message.setRole("ASSISTANT");
        message.setCreatedAt(Instant.parse("2026-07-30T00:00:00Z"));
        return message;
    }

    private static GenerationTask task(long id, long creationTaskId) {
        GenerationTask task = new GenerationTask();
        task.setId(id);
        task.setCreationTaskId(creationTaskId);
        return task;
    }

    private static GenerationTaskSnapshotResponse snapshot(String taskId) {
        return new GenerationTaskSnapshotResponse(taskId, "201", "SUCCEEDED", 1, 0, 3, 1, 1,
                0, null, null, List.of(), Instant.parse("2026-07-30T00:00:00Z"), null);
    }
}
