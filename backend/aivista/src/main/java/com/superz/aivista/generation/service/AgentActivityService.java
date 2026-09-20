package com.superz.aivista.generation.service;

import com.superz.aivista.generation.entity.CreationActivity;
import com.superz.aivista.generation.mapper.CreationActivityMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.message.AgentActivityItem;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Service;

/** 在 Agent 暂停或完成事务中按执行分段追加用户可见步骤。 */
@Service
public class AgentActivityService {
    private final CreationActivityMapper activities;
    private final GenerationTaskMapper generationTasks;

    public AgentActivityService(CreationActivityMapper activities, GenerationTaskMapper generationTasks) {
        this.activities = activities;
        this.generationTasks = generationTasks;
    }

    void persistLocked(long creationTaskId, List<AgentActivityItem> items) {
        if (items == null || items.size() > 100) throw new IllegalArgumentException("Invalid Agent activities");
        int sequence = activities.selectMaxSequenceNo(creationTaskId) + 1;
        for (AgentActivityItem item : items) {
            validateItem(item);
            validateGenerationTask(creationTaskId, item.generationTaskId());
            activities.insertSelective(entity(creationTaskId, sequence++, item));
        }
    }

    private static void validateItem(AgentActivityItem item) {
        if (item == null || !List.of("NARRATION", "SKILL", "TOOL").contains(item.type())
                || !List.of("COMPLETED", "FAILED", "CANCELLED").contains(item.outcome())
                || blank(item.content()) || item.content().codePointCount(0, item.content().length()) > 1_000
                || (item.toolName() != null && (blank(item.toolName()) || item.toolName().length() > 64))
                || item.startedAt() == null
                || item.completedAt() == null || item.completedAt().isBefore(item.startedAt())) {
            throw new IllegalArgumentException("Invalid Agent activity");
        }
        parseOptionalId(item.generationTaskId());
    }

    private static CreationActivity entity(long creationTaskId, int sequence, AgentActivityItem item) {
        CreationActivity activity = new CreationActivity();
        activity.setCreationTaskId(creationTaskId);
        activity.setSequenceNo(sequence);
        activity.setActivityType(item.type());
        activity.setOutcome(item.outcome());
        activity.setContent(item.content());
        activity.setToolName(item.toolName());
        activity.setGenerationTaskId(parseOptionalId(item.generationTaskId()));
        activity.setStartedAt(item.startedAt());
        activity.setCompletedAt(item.completedAt());
        return activity;
    }

    private static long parseId(String value) {
        try { return Long.parseLong(value); }
        catch (RuntimeException exception) { throw new IllegalArgumentException("Invalid numeric ID", exception); }
    }

    private static Long parseOptionalId(String value) {
        if (value == null) return null;
        long id = parseId(value);
        if (id <= 0) throw new IllegalArgumentException("Invalid numeric ID");
        return id;
    }

    private void validateGenerationTask(long creationTaskId, String value) {
        Long taskId = parseOptionalId(value);
        if (taskId != null && !Objects.equals(generationTasks.selectCreationTaskId(taskId), creationTaskId)) {
            throw new IllegalArgumentException("Generation task does not belong to Agent creation");
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
