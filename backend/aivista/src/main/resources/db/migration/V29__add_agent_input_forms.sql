CREATE TABLE `creation_forms` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `creation_task_id` BIGINT UNSIGNED NOT NULL COMMENT '所属 Agent 创作轮次',
    `tool_call_id` VARCHAR(128) NOT NULL COMMENT '产生该表单的 Pi Tool Call ID',
    `status` VARCHAR(16) NOT NULL COMMENT 'PENDING、SUBMITTED 或 SKIPPED',
    `form_json` JSON NOT NULL COMMENT '标题、字段、选项、初始值及 Schema 版本',
    `answer_json` JSON DEFAULT NULL COMMENT '用户提交的答案；PENDING 和 SKIPPED 时为空',
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_creation_forms_tool_call` (`creation_task_id`, `tool_call_id`),
    CONSTRAINT `fk_creation_forms_creation_task`
        FOREIGN KEY (`creation_task_id`) REFERENCES `creation_tasks` (`id`) ON DELETE CASCADE,
    CONSTRAINT `chk_creation_forms_status`
        CHECK (`status` IN ('PENDING', 'SUBMITTED', 'SKIPPED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Agent 创作轮次中的用户需求确认表单';

ALTER TABLE `creation_tasks`
    MODIFY COLUMN `status` VARCHAR(16) NOT NULL
        COMMENT 'RUNNING、WAITING_INPUT、SUCCEEDED、FAILED 或 CANCELLED';

ALTER TABLE `agent_worker_executions`
    ADD COLUMN `execution_revision` BIGINT UNSIGNED NOT NULL DEFAULT 0
        COMMENT '当前执行分段对应的 Creation revision' AFTER `creation_task_id`,
    CHANGE COLUMN `completion_json` `payload_json` JSON DEFAULT NULL
        COMMENT '等待重放的暂停检查点或最终 Completion',
    MODIFY COLUMN `state` VARCHAR(24) NOT NULL
        COMMENT 'RUNNING、PAUSE_READY、COMPLETION_READY 或 INTERRUPTED';
