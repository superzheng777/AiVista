ALTER TABLE `outbox_events`
    ADD COLUMN `task_status` VARCHAR(32) DEFAULT NULL
        COMMENT 'TASK_STATUS_CHANGED发生时的任务状态快照' AFTER `task_version`,
    ADD COLUMN `model_retry_count` TINYINT UNSIGNED DEFAULT NULL
        COMMENT 'TASK_STATUS_CHANGED发生时已安排的模型重试次数' AFTER `task_status`;
