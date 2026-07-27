package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 用户持久化生成会话。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "generation_sessions", mapperGenerateEnable = false)
public class GenerationSession {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long userId;
    private String title;
    private Instant lastMessageAt;
    private Instant createdAt;
    private Instant updatedAt;
}
