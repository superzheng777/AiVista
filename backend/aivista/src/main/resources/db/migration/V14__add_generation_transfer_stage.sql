ALTER TABLE `generation_tasks`
    ADD COLUMN `transfer_started_at` DATETIME(3) DEFAULT NULL COMMENT '转存消费者实际开始处理时间',
    ADD KEY `idx_generation_tasks_transfer_waiting`
        (`status`, `transfer_started_at`, `updated_at`, `id`);
