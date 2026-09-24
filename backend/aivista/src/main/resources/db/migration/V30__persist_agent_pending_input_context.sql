ALTER TABLE `creation_forms`
    MODIFY COLUMN `status` VARCHAR(16) NOT NULL
        COMMENT 'PENDING、SUBMITTED、SKIPPED 或 CANCELLED',
    MODIFY COLUMN `answer_json` JSON DEFAULT NULL
        COMMENT '用户提交的答案；仅 SUBMITTED 时可有值',
    DROP CHECK `chk_creation_forms_status`,
    ADD CONSTRAINT `chk_creation_forms_status`
        CHECK (`status` IN ('PENDING', 'SUBMITTED', 'SKIPPED', 'CANCELLED'));

ALTER TABLE `agent_worker_executions`
    MODIFY COLUMN `payload_json` JSON DEFAULT NULL
        COMMENT 'Java确认前可重放的暂停请求，或待重放的最终 Completion';

ALTER TABLE `agent_session_contexts`
    ADD COLUMN `snapshot_creation_task_id` BIGINT UNSIGNED DEFAULT NULL
        COMMENT '产生当前逻辑 Context 的 Agent 创作轮次' AFTER `context_json`,
    ADD COLUMN `snapshot_revision` BIGINT UNSIGNED DEFAULT NULL
        COMMENT '当前逻辑 Context 对应的 Creation revision' AFTER `snapshot_creation_task_id`,
    ADD COLUMN `pending_tool_call_id` VARCHAR(128) DEFAULT NULL
        COMMENT '需要在后续执行中恢复的表单 Tool Call ID' AFTER `snapshot_revision`,
    ADD COLUMN `pending_input_status` VARCHAR(16) DEFAULT NULL
        COMMENT 'PENDING、SUBMITTED、SKIPPED、CANCELLED 或 NULL' AFTER `pending_tool_call_id`,
    MODIFY COLUMN `updated_at` DATETIME(3) NOT NULL
        COMMENT '当前逻辑 Context 或待处理输入元数据的最后更新时间',
    ADD CONSTRAINT `chk_agent_session_context_snapshot`
        CHECK (
            (`snapshot_creation_task_id` IS NULL AND `snapshot_revision` IS NULL)
            OR
            (`snapshot_creation_task_id` IS NOT NULL AND `snapshot_revision` IS NOT NULL)
        ),
    ADD CONSTRAINT `chk_agent_session_context_pending_input`
        CHECK (
            (`pending_tool_call_id` IS NULL AND `pending_input_status` IS NULL)
            OR
            (`snapshot_creation_task_id` IS NOT NULL
                AND `snapshot_revision` IS NOT NULL
                AND `pending_tool_call_id` IS NOT NULL
                AND `pending_input_status` IN ('PENDING', 'SUBMITTED', 'SKIPPED', 'CANCELLED'))
        );
