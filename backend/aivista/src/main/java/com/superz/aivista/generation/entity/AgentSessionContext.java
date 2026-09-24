package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 每个 Agent 会话唯一的逻辑 Context 与待恢复输入。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "agent_session_contexts", mapperGenerateEnable = false)
public class AgentSessionContext {
    @Id(keyType = KeyType.None)
    private Long sessionId;
    private String contextJson;
    private Long snapshotCreationTaskId;
    private Long snapshotRevision;
    private String pendingToolCallId;
    private String pendingInputStatus;
    private Instant updatedAt;
}
