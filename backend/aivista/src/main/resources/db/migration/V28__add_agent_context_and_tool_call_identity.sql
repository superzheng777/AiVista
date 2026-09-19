ALTER TABLE `generation_tasks`
    DROP INDEX `uk_generation_tasks_agent_request`,
    CHANGE COLUMN `agent_request_id` `tool_call_id` VARCHAR(128) DEFAULT NULL
        COMMENT 'Pi Tool 调用 ID；普通任务为空',
    ADD UNIQUE KEY `uk_generation_tasks_tool_call`
        (`creation_task_id`, `tool_call_id`);

CREATE TABLE `agent_session_contexts` (
    `session_id` BIGINT UNSIGNED NOT NULL COMMENT 'Agent 会话 ID',
    `context_json` JSON NOT NULL COMMENT 'Pi 压缩摘要与近期完整消息组成的逻辑上下文',
    `updated_at` DATETIME(3) NOT NULL COMMENT '最后一次成功 Agent Creation 提交时间',
    PRIMARY KEY (`session_id`),
    CONSTRAINT `fk_agent_session_contexts_session_id`
        FOREIGN KEY (`session_id`) REFERENCES `generation_sessions` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '每个 Agent 会话唯一的 Pi 逻辑上下文快照';
