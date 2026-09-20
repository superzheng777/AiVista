package com.superz.aivista.generation.service;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.dto.CancelAgentCreationResponse;
import com.superz.aivista.generation.entity.CreationTask;
import com.superz.aivista.generation.mapper.CreationTaskMapper;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 由 Java 业务事实层原子提交 Agent Creation 的用户取消。 */
@Service
public class AgentCancellationService {
    private final CreationTaskMapper creations;
    private final Clock clock;

    public AgentCancellationService(CreationTaskMapper creations, Clock clock) {
        this.creations = creations;
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
        Instant now = clock.instant();
        if (creations.cancelActive(creationTaskId, executionRevision, now) != 1) {
            throw new BusinessException(ErrorCode.AGENT_CREATION_NOT_RUNNING);
        }
        creation.setStatus("CANCELLED");
        creation.setFailureCode(null);
        creation.setRevision(executionRevision + 1);
        creation.setCompletedAt(now);
        return new CancellationResult(response(creation), true, executionRevision);
    }

    private static CancelAgentCreationResponse response(CreationTask creation) {
        return new CancelAgentCreationResponse(creation.getId().toString(), creation.getSessionId().toString(),
                creation.getStatus(), creation.getRevision(), creation.getCompletedAt());
    }

    public record CancellationResult(CancelAgentCreationResponse response, boolean transitioned,
            long executionRevision) {}
}
