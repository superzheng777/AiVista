package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 会话内一轮用户提示词消息。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "generation_messages", mapperGenerateEnable = false)
public class GenerationMessage {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long sessionId;
    private Integer sequenceNo;
    private String prompt;
    private String negativePrompt;
    private Instant createdAt;
}
