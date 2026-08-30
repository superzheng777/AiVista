CREATE TABLE `generation_sessions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '生成会话ID',
    `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户ID',
    `title` VARCHAR(100) NOT NULL COMMENT '用户可修改的会话标题',
    `last_message_at` DATETIME(3) NOT NULL COMMENT '最后一次用户消息时间',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_generation_sessions_user_last_message` (`user_id`, `last_message_at`),
    CONSTRAINT `fk_generation_sessions_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '用户生成会话表';

CREATE TABLE `creation_tasks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '一次会话创作轮次ID',
    `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户ID',
    `session_id` BIGINT UNSIGNED NOT NULL COMMENT '所属生成会话ID',
    `mode` VARCHAR(16) NOT NULL COMMENT 'NORMAL或未来的AGENT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_creation_tasks_session_created` (`session_id`, `created_at`, `id`),
    CONSTRAINT `fk_creation_tasks_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_creation_tasks_session_id`
        FOREIGN KEY (`session_id`) REFERENCES `generation_sessions` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '普通与Agent模式共用的会话创作轮次';

CREATE TABLE `conversation_messages` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话消息ID',
    `session_id` BIGINT UNSIGNED NOT NULL COMMENT '所属生成会话ID',
    `creation_task_id` BIGINT UNSIGNED NOT NULL COMMENT '所属创作轮次ID',
    `sequence_no` INT UNSIGNED NOT NULL COMMENT '会话内从1开始的消息顺序',
    `role` VARCHAR(16) NOT NULL COMMENT 'USER或ASSISTANT',
    `content` TEXT DEFAULT NULL COMMENT '用户可见消息内容',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_conversation_messages_session_sequence` (`session_id`, `sequence_no`),
    UNIQUE KEY `uk_conversation_messages_task_role` (`creation_task_id`, `role`),
    CONSTRAINT `fk_conversation_messages_session_id`
        FOREIGN KEY (`session_id`) REFERENCES `generation_sessions` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_conversation_messages_creation_task_id`
        FOREIGN KEY (`creation_task_id`) REFERENCES `creation_tasks` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '普通与Agent模式共用的用户可见会话消息';

CREATE TABLE `generation_tasks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '异步图像生成任务ID',
    `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户ID',
    `session_id` BIGINT UNSIGNED NOT NULL COMMENT '所属会话ID',
    `creation_task_id` BIGINT UNSIGNED NOT NULL COMMENT '所属创作轮次ID',
    `model` VARCHAR(128) NOT NULL COMMENT '完整模型标识，例如bailian/qwen-image-2.0',
    `status` VARCHAR(32) NOT NULL DEFAULT 'QUEUED' COMMENT '任务状态，由应用状态机校验',
    `task_version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '乐观锁与SSE状态版本',
    `attempt_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '可重试调用次数',
    `provider_call_started_at` DATETIME(3) DEFAULT NULL COMMENT '服务商调用开始时间',
    `final_prompt` TEXT NOT NULL COMMENT '实际发送给模型的正向提示词',
    `final_negative_prompt` TEXT DEFAULT NULL COMMENT '实际发送给模型的负向提示词',
    `width` INT UNSIGNED NOT NULL COMMENT '请求图片宽度',
    `height` INT UNSIGNED NOT NULL COMMENT '请求图片高度',
    `requested_image_count` TINYINT UNSIGNED NOT NULL COMMENT '请求图片数量',
    `completed_image_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '成功转存图片数量',
    `quota_refunded_at` DATETIME(3) DEFAULT NULL COMMENT '平台侧失败返还每日额度的时间',
    `provider_request_id` VARCHAR(128) DEFAULT NULL COMMENT '服务商请求追踪ID',
    `provider_result_snapshot` JSON DEFAULT NULL COMMENT '仅供OSS转存恢复的临时结果快照',
    `idempotency_key` CHAR(36) NOT NULL COMMENT 'UUID v4幂等键',
    `request_fingerprint` CHAR(64) NOT NULL COMMENT '请求参数SHA-256十六进制摘要',
    `failure_code` VARCHAR(64) DEFAULT NULL COMMENT '稳定失败分类',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
    `started_at` DATETIME(3) DEFAULT NULL COMMENT '首次进入RUNNING的时间',
    `completed_at` DATETIME(3) DEFAULT NULL COMMENT '进入终态的时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_generation_tasks_user_idempotency` (`user_id`, `idempotency_key`),
    UNIQUE KEY `uk_generation_tasks_creation_task` (`creation_task_id`),
    KEY `idx_generation_tasks_session_created` (`session_id`, `created_at`),
    KEY `idx_generation_tasks_user_status` (`user_id`, `status`),
    CONSTRAINT `fk_generation_tasks_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_generation_tasks_session_id`
        FOREIGN KEY (`session_id`) REFERENCES `generation_sessions` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_generation_tasks_creation_task_id`
        FOREIGN KEY (`creation_task_id`) REFERENCES `creation_tasks` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '异步图像生成任务表';

CREATE TABLE `generation_images` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '生成结果图片ID',
    `task_id` BIGINT UNSIGNED NOT NULL COMMENT '所属生成任务ID',
    `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户ID',
    `object_key` VARCHAR(512) NOT NULL COMMENT '私有OSS图片对象组公共前缀',
    `content_type` VARCHAR(64) NOT NULL COMMENT '文件类型，首版固定image/png',
    `file_size` BIGINT UNSIGNED NOT NULL COMMENT '文件字节数',
    `width` INT UNSIGNED NOT NULL COMMENT '实际图片宽度',
    `height` INT UNSIGNED NOT NULL COMMENT '实际图片高度',
    `source_index` TINYINT UNSIGNED NOT NULL COMMENT '服务商结果内部序号',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '保存时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_generation_images_task_source` (`task_id`, `source_index`),
    KEY `idx_generation_images_user_created` (`user_id`, `created_at`),
    CONSTRAINT `fk_generation_images_task_id`
        FOREIGN KEY (`task_id`) REFERENCES `generation_tasks` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_generation_images_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '生成结果图片表';

CREATE TABLE `outbox_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Outbox事件ID',
    `event_type` VARCHAR(32) NOT NULL COMMENT 'TASK_EXECUTE或TASK_STATUS_CHANGED',
    `task_id` BIGINT UNSIGNED NOT NULL COMMENT '关联生成任务ID',
    `task_version` INT UNSIGNED NOT NULL COMMENT '关联任务状态版本',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT '分发状态，由应用逻辑校验',
    `retry_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '投递重试次数',
    `available_at` DATETIME(3) NOT NULL COMMENT '下次允许投递时间',
    `locked_at` DATETIME(3) DEFAULT NULL COMMENT '分发器领取时间',
    `published_at` DATETIME(3) DEFAULT NULL COMMENT '成功投递时间',
    `last_error` VARCHAR(512) DEFAULT NULL COMMENT '安全的内部失败摘要',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_outbox_events_status_available` (`status`, `available_at`),
    CONSTRAINT `fk_outbox_events_task_id`
        FOREIGN KEY (`task_id`) REFERENCES `generation_tasks` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '生成任务可靠事件分发表';

CREATE TABLE `user_generation_daily_usage` (
    `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    `usage_date` DATE NOT NULL COMMENT '按北京时间计算的业务自然日',
    `requested_image_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当日已请求图片数量',
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最近额度占用时间',
    PRIMARY KEY (`user_id`, `usage_date`),
    CONSTRAINT `fk_user_generation_daily_usage_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '用户每日生成图片额度表';

CREATE TABLE `user_consents` (
    `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
    `consent_type` VARCHAR(64) NOT NULL COMMENT '同意类型',
    `policy_version` VARCHAR(64) NOT NULL COMMENT '当前已同意的规则版本',
    `policy_content_hash` CHAR(64) NOT NULL COMMENT '规则文案SHA-256十六进制摘要',
    `consented_at` DATETIME(3) NOT NULL COMMENT '最后一次确认时间',
    PRIMARY KEY (`user_id`, `consent_type`),
    CONSTRAINT `fk_user_consents_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = '用户第三方数据处理同意记录表';
