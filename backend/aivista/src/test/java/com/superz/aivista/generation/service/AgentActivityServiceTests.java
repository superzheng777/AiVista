package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.generation.entity.CreationActivity;
import com.superz.aivista.generation.mapper.CreationActivityMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.message.AgentActivityItem;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AgentActivityServiceTests {
    private static final Instant STARTED = Instant.parse("2026-09-09T01:00:00Z");
    private static final Instant COMPLETED = Instant.parse("2026-09-09T01:01:00Z");
    private final CreationActivityMapper activities = mock(CreationActivityMapper.class);
    private final GenerationTaskMapper generationTasks = mock(GenerationTaskMapper.class);
    private final AgentActivityService service = new AgentActivityService(activities, generationTasks);

    @Test
    void persistsFinalActivitiesOnceInTheirSubmittedOrder() {
        when(generationTasks.selectCreationTaskId(9001L)).thenReturn(151L);

        service.persistFinalLocked(151L, List.of(
                item("NARRATION", "COMPLETED", "我会先确定版式。", null, null),
                item("TOOL", "COMPLETED", "文生图已完成。", "text_to_image", "9001")));

        ArgumentCaptor<CreationActivity> inserted = ArgumentCaptor.forClass(CreationActivity.class);
        verify(activities, org.mockito.Mockito.times(2)).insertSelective(inserted.capture());
        assertThat(inserted.getAllValues()).extracting(CreationActivity::getSequenceNo)
                .containsExactly(1, 2);
        assertThat(inserted.getAllValues().getLast().getOutcome()).isEqualTo("COMPLETED");
    }

    @Test
    void rejectsForeignGenerationActivities() {
        when(generationTasks.selectCreationTaskId(9001L)).thenReturn(999L);

        assertThatThrownBy(() -> service.persistFinalLocked(151L, List.of(
                item("TOOL", "COMPLETED", "文生图已完成。", "text_to_image", "9001"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static AgentActivityItem item(String type, String outcome, String content,
            String toolName, String generationTaskId) {
        return new AgentActivityItem(type, outcome, content, toolName, generationTaskId, STARTED, COMPLETED);
    }
}
