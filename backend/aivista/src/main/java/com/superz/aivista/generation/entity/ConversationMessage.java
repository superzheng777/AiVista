package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 一次创作轮次中的用户输入或助手回复。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "conversation_messages", mapperGenerateEnable = false)
public class ConversationMessage {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long sessionId;
    private Long creationTaskId;
    private Integer sequenceNo;
    private String role;
    private String content;
    private Instant createdAt;
}
