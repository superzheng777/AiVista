package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Agent 暂停等待用户确认时持久化的产品表单。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "creation_forms", mapperGenerateEnable = false)
public class CreationForm {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long creationTaskId;
    private String toolCallId;
    private String status;
    private String formJson;
    private String answerJson;
    private Instant requestedAt;
    private Instant resolvedAt;
}
