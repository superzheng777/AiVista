ALTER TABLE `generation_images`
    ADD COLUMN `deleted_at` DATETIME(3) DEFAULT NULL COMMENT '用户删除资产的时间，NULL表示当前可见',
    ADD COLUMN `oss_cleanup_status` VARCHAR(16) DEFAULT NULL COMMENT '私有OSS清理状态：PENDING或SUCCEEDED',
    ADD COLUMN `oss_cleanup_attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '私有OSS清理尝试次数',
    ADD COLUMN `oss_cleanup_available_at` DATETIME(3) DEFAULT NULL COMMENT '下次允许执行私有OSS清理的时间',
    ADD COLUMN `oss_cleanup_last_error` VARCHAR(512) DEFAULT NULL COMMENT '最近一次私有OSS清理的安全错误摘要',
    DROP INDEX `idx_generation_images_user_created`,
    ADD KEY `idx_generation_images_user_visible_created` (`user_id`, `deleted_at`, `created_at`, `id`),
    ADD KEY `idx_generation_images_cleanup` (`oss_cleanup_status`, `oss_cleanup_available_at`);
