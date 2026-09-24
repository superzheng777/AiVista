package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.CancelAgentCreationResponse;
import com.superz.aivista.generation.entity.AgentSessionContext;
import com.superz.aivista.generation.entity.CreationForm;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.mapper.AgentSessionContextMapper;
import com.superz.aivista.generation.mapper.CreationFormMapper;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 由 Java 业务事实层原子提交 Agent Creation 的用户取消。 */
@Service
public class AgentCancellationService {
    private final CreationTaskMapper creations;
    private final CreationFormMapper forms;
    private final AgentSessionContextMapper contexts;
    private final Clock clock;

    public AgentCancellationService(CreationTaskMapper creations, CreationFormMapper forms,
            AgentSessionContextMapper contexts, Clock clock) {
        this.creations = creations;
        this.forms = forms;
        this.contexts = contexts;
        this.clock = clock;
    }

    @Transactional
    public CancellationResult cancel(long userId, long creationTaskId) {
        CreationTask creation = creations.selectByIdForUpdate(creationTaskId);
        if (creation == null || creation.getUserId() != userId || !"AGENT".equals(creation.getMode())) {
            throw new BusinessException(ErrorCode.GENERATION_RESOURCE_NOT_FOUND);
        }
        if ("CANCELLED".equals(creation.getStatus())) {
            return new CancellationResult(response(creation), false, creation.getRevision() - 1);
        }
        if (!("RUNNING".equals(creation.getStatus()) || "WAITING_INPUT".equals(creation.getStatus()))
                || creation.getRevision() == null) {
            throw new BusinessException(ErrorCode.AGENT_CREATION_NOT_RUNNING);
        }
        long executionRevision = creation.getRevision();
        long nextRevision = executionRevision + 1;
        Instant now = clock.instant();
        AgentSessionContext context = contexts.selectBySessionId(creation.getSessionId());
        boolean hasCurrentPending = matchesCurrentPending(context, creationTaskId, executionRevision);
        if ("WAITING_INPUT".equals(creation.getStatus())) {
            if (!hasCurrentPending || !"PENDING".equals(context.getPendingInputStatus())) {
                throw new BusinessException(ErrorCode.AGENT_CREATION_NOT_RUNNING);
            }
            CreationForm form = forms.selectByToolCallForUpdate(
                    creationTaskId, context.getPendingToolCallId());
            if (form == null || !"PENDING".equals(form.getStatus())
                    || forms.cancelPending(form.getId(), now) != 1) {
                throw new BusinessException(ErrorCode.AGENT_CREATION_NOT_RUNNING);
            }
        }
        if (hasCurrentPending && contexts.transitionPending(creation.getSessionId(), creationTaskId,
                executionRevision, nextRevision, context.getPendingToolCallId(),
                context.getPendingInputStatus(), "CANCELLED", now) != 1) {
            throw new BusinessException(ErrorCode.AGENT_CREATION_NOT_RUNNING);
        }
        if (creations.cancelActive(creationTaskId, executionRevision, now) != 1) {
            throw new BusinessException(ErrorCode.AGENT_CREATION_NOT_RUNNING);
        }
        creation.setStatus("CANCELLED");
        creation.setFailureCode(null);
        creation.setRevision(nextRevision);
        creation.setCompletedAt(now);
        return new CancellationResult(response(creation), true, executionRevision);
    }

    private static CancelAgentCreationResponse response(CreationTask creation) {
        return new CancelAgentCreationResponse(creation.getId().toString(), creation.getSessionId().toString(),
                creation.getStatus(), creation.getRevision(), creation.getCompletedAt());
    }

    private static boolean matchesCurrentPending(AgentSessionContext context,
            long creationTaskId, long revision) {
        return context != null
                && context.getSnapshotCreationTaskId() != null
                && context.getSnapshotCreationTaskId() == creationTaskId
                && context.getSnapshotRevision() != null
                && context.getSnapshotRevision() == revision
                && context.getPendingToolCallId() != null
                && context.getPendingInputStatus() != null;
    }

    public record CancellationResult(CancelAgentCreationResponse response, boolean transitioned,
            long executionRevision) {}
}
