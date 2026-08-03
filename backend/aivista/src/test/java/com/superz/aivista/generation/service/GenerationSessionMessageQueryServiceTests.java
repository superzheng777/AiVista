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
import com.superz.aivista.generation.entity.GenerationMessage;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.GenerationMessageMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class GenerationSessionMessageQueryServiceTests {
    @Test
    void returnsMessagesInChronologicalOrderAndUsesTheOldestMessageAsCursor() {
        GenerationSessionMapper sessionMapper = mock(GenerationSessionMapper.class);
        GenerationMessageMapper messageMapper = mock(GenerationMessageMapper.class);
        GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
        GenerationImageMapper imageMapper = mock(GenerationImageMapper.class);
        GenerationTaskQueryService taskQueryService = mock(GenerationTaskQueryService.class);
        when(sessionMapper.selectOwnedById(201L, 7L)).thenReturn(new GenerationSession());
        when(messageMapper.selectPageBySessionId(201L, null, 3))
                .thenReturn(List.of(message(23, 3), message(22, 2), message(21, 1)));
        GenerationTask task2 = task(302, 22);
        GenerationTask task3 = task(303, 23);
        when(taskMapper.selectBySourceMessageIds(List.of(22L, 23L))).thenReturn(List.of(task2, task3));
        when(imageMapper.selectByTaskIds(List.of(302L, 303L))).thenReturn(List.of());
        when(taskQueryService.snapshot(eq(task2), anyList())).thenReturn(snapshot("302"));
        when(taskQueryService.snapshot(eq(task3), anyList())).thenReturn(snapshot("303"));

        var response = service(sessionMapper, messageMapper, taskMapper, imageMapper, taskQueryService)
                .list(7L, 201L, null, 2);

        assertThat(response.hasMore()).isTrue();
        assertThat(response.nextBefore()).isEqualTo("Mg");
        assertThat(response.items()).extracting(item -> item.message().sequenceNo()).containsExactly(2, 3);
        assertThat(response.items()).extracting(item -> item.generation().taskId()).containsExactly("302", "303");
        verify(taskMapper).selectBySourceMessageIds(List.of(22L, 23L));
        verify(imageMapper).selectByTaskIds(List.of(302L, 303L));
    }

    @Test
    void rejectsForeignSessionAndInvalidCursor() {
        GenerationSessionMapper sessionMapper = mock(GenerationSessionMapper.class);
        GenerationSessionMessageQueryService service = service(sessionMapper, mock(GenerationMessageMapper.class),
                mock(GenerationTaskMapper.class), mock(GenerationImageMapper.class), mock(GenerationTaskQueryService.class));

        assertThatThrownBy(() -> service.list(7L, 201L, null, 20))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.GENERATION_RESOURCE_NOT_FOUND));

        when(sessionMapper.selectOwnedById(201L, 7L)).thenReturn(new GenerationSession());
        assertThatThrownBy(() -> service.list(7L, 201L, "bad-cursor", 20))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_CURSOR));
    }

    private static GenerationSessionMessageQueryService service(GenerationSessionMapper sessionMapper,
            GenerationMessageMapper messageMapper, GenerationTaskMapper taskMapper, GenerationImageMapper imageMapper,
            GenerationTaskQueryService taskQueryService) {
        return new GenerationSessionMessageQueryService(sessionMapper, messageMapper, taskMapper, imageMapper,
                taskQueryService);
    }

    private static GenerationMessage message(long id, int sequenceNo) {
        GenerationMessage message = new GenerationMessage();
        message.setId(id);
        message.setSequenceNo(sequenceNo);
        message.setPrompt("prompt " + sequenceNo);
        message.setCreatedAt(Instant.parse("2026-07-30T00:00:00Z"));
        return message;
    }

    private static GenerationTask task(long id, long sourceMessageId) {
        GenerationTask task = new GenerationTask();
        task.setId(id);
        task.setSourceMessageId(sourceMessageId);
        return task;
    }

    private static GenerationTaskSnapshotResponse snapshot(String taskId) {
        return new GenerationTaskSnapshotResponse(taskId, "201", "SUCCEEDED", 1, 0, 3, 1, 1,
                0, 0, null, null, List.of(), Instant.parse("2026-07-30T00:00:00Z"), null);
    }
}
