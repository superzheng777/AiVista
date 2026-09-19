ALTER TABLE `generation_tasks`
    ADD COLUMN `agent_request_id` VARCHAR(128) DEFAULT NULL
        COMMENT 'Agent Tool 创建请求身份；普通任务为空' AFTER `creation_task_id`,
    CHANGE COLUMN `task_version` `revision` INT UNSIGNED NOT NULL DEFAULT 0
        COMMENT '任务状态修订号；用于条件更新与实时事件去重',
    ADD UNIQUE KEY `uk_generation_tasks_agent_request`
        (`creation_task_id`, `agent_request_id`);

UPDATE `agent_worker_executions`
SET `state` = 'COMPLETION_READY'
WHERE `state` = 'COMPLETED';

ALTER TABLE `agent_worker_executions`
    CHANGE COLUMN `result_json` `completion_json` JSON DEFAULT NULL
        COMMENT '等待向 Java 重放的最终 Agent Completion',
    MODIFY COLUMN `state` VARCHAR(24) NOT NULL
        COMMENT 'RUNNING、COMPLETION_READY 或 INTERRUPTED';

-- 中间 Activity 不再作为数据库事实；只保留 Agent 最终提交的不可变步骤。
DELETE FROM `creation_activities`;

ALTER TABLE `creation_activities`
    DROP INDEX `uk_creation_activities_key`,
    DROP COLUMN `activity_key`,
    CHANGE COLUMN `state` `outcome` VARCHAR(16) NOT NULL
        COMMENT 'COMPLETED、FAILED 或 CANCELLED',
    MODIFY COLUMN `completed_at` DATETIME(3) NOT NULL;

DROP TABLE `idempotency_records`;
