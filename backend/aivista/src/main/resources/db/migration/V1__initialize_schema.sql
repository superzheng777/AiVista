-- Initial schema. Conversation content lives in native Pi session files.

CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '用户唯一ID',
  `login_name` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户登录账号，不作为公开展示昵称，大小写不敏感',
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密码哈希值，不保存明文密码',
  `nickname` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户公开展示昵称，允许重名',
  `avatar_url` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户头像地址',
  `bio` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户个人简介',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  `received_like_count` bigint unsigned NOT NULL DEFAULT '0',
  `likes_public` tinyint(1) NOT NULL DEFAULT '0',
  `follower_count` bigint unsigned NOT NULL DEFAULT '0',
  `following_count` bigint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) COMMENT '用户主键索引',
  UNIQUE KEY `uk_users_login_name` (`login_name`) COMMENT '登录账号唯一索引，基于大小写不敏感排序规则生效'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AiVista普通用户基础信息表';

CREATE TABLE `auth_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '认证会话唯一ID',
  `user_id` bigint unsigned NOT NULL COMMENT '会话所属用户ID',
  `client_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户端类型，当前使用WEB并为后续APP预留',
  `refresh_token_hash` binary(32) NOT NULL COMMENT '当前Refresh Token的SHA-256哈希，不保存令牌明文',
  `expires_at` datetime NOT NULL COMMENT '会话最终过期时间，刷新不延长',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '会话创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '会话最后更新时间',
  PRIMARY KEY (`id`) COMMENT '认证会话主键索引',
  UNIQUE KEY `uk_auth_sessions_refresh_token_hash` (`refresh_token_hash`) COMMENT 'Refresh Token哈希唯一索引',
  KEY `idx_auth_sessions_user_id` (`user_id`) COMMENT '用户认证会话查询索引',
  KEY `idx_auth_sessions_expires_at` (`expires_at`) COMMENT '过期认证会话清理索引',
  CONSTRAINT `fk_auth_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_auth_sessions_client_type` CHECK ((`client_type` in (_utf8mb4'WEB',_utf8mb4'APP')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AiVista用户认证会话表';

CREATE TABLE `user_consents` (
  `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  `consent_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '同意类型',
  `policy_version` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '当前已同意的规则版本',
  `policy_content_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则文案SHA-256十六进制摘要',
  `consented_at` datetime(3) NOT NULL COMMENT '最后一次确认时间',
  PRIMARY KEY (`user_id`,`consent_type`),
  CONSTRAINT `fk_user_consents_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户第三方数据处理同意记录表';

CREATE TABLE `user_follows` (
  `follower_user_id` bigint unsigned NOT NULL,
  `following_user_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`follower_user_id`,`following_user_id`),
  KEY `idx_user_follows_following_user_id` (`following_user_id`,`follower_user_id`),
  CONSTRAINT `fk_user_follows_follower_user_id` FOREIGN KEY (`follower_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_user_follows_following_user_id` FOREIGN KEY (`following_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `generation_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '生成会话ID',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户ID',
  `title` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户可修改的会话标题',
  `last_message_at` datetime(3) NOT NULL COMMENT '最后一次用户消息时间',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  `creation_count` smallint unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_generation_sessions_user_last_message` (`user_id`,`last_message_at`),
  CONSTRAINT `fk_generation_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户生成会话表';

CREATE TABLE executions (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  user_id bigint unsigned NOT NULL,
  session_id bigint unsigned NOT NULL,
  parent_id bigint unsigned DEFAULT NULL,
  kind varchar(16) NOT NULL,
  mode varchar(16) NOT NULL,
  tool_call_id varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  status varchar(32) NOT NULL DEFAULT 'QUEUED',
  revision int unsigned NOT NULL DEFAULT 0,
  request_json json NOT NULL,
  pending_tool_call_id varchar(128) COLLATE utf8mb4_bin DEFAULT NULL,
  dispatched_at datetime(3) DEFAULT NULL,
  operation varchar(32) DEFAULT NULL,
  model varchar(128) DEFAULT NULL,
  final_prompt text,
  final_negative_prompt text,
  width int unsigned DEFAULT NULL,
  height int unsigned DEFAULT NULL,
  prompt_extend boolean NOT NULL DEFAULT TRUE,
  requested_image_count tinyint unsigned DEFAULT NULL,
  completed_image_count tinyint unsigned NOT NULL DEFAULT 0,
  quota_reserved_at datetime(3) DEFAULT NULL,
  quota_refunded_at datetime(3) DEFAULT NULL,
  settled_at datetime(3) DEFAULT NULL,
  provider_request_id varchar(128) DEFAULT NULL,
  failure_code varchar(64) DEFAULT NULL,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  completed_at datetime(3) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_executions_parent_tool (parent_id, tool_call_id),
  KEY idx_executions_session (session_id, kind, id),
  KEY idx_executions_queued (status, id),
  KEY idx_executions_user_status (user_id, status),
  CONSTRAINT fk_executions_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_executions_session FOREIGN KEY (session_id) REFERENCES generation_sessions (id),
  CONSTRAINT fk_executions_parent FOREIGN KEY (parent_id) REFERENCES executions (id),
  CONSTRAINT ck_executions_kind CHECK (kind IN ('CREATION', 'GENERATION')),
  CONSTRAINT ck_executions_mode CHECK (mode IN ('NORMAL', 'AGENT')),
  CONSTRAINT ck_executions_parent CHECK ((kind = 'CREATION' AND parent_id IS NULL) OR (kind = 'GENERATION' AND parent_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `image_assets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `origin` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'UPLOADED or GENERATED',
  `lifecycle` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'TEMPORARY or PERSISTENT',
  `origin_task_id` bigint unsigned DEFAULT NULL,
  `source_index` tinyint unsigned DEFAULT NULL,
  `object_key` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_object_key` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint unsigned NOT NULL,
  `width` int unsigned NOT NULL,
  `height` int unsigned NOT NULL,
  `is_favorited` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` datetime(3) DEFAULT NULL,
  `expires_at` datetime(3) DEFAULT NULL,
  `oss_cleanup_status` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `oss_cleanup_attempt_count` int unsigned NOT NULL DEFAULT '0',
  `oss_cleanup_available_at` datetime(3) DEFAULT NULL,
  `oss_cleanup_last_error` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_image_assets_origin_task_source` (`origin_task_id`,`source_index`),
  KEY `idx_image_assets_user_visible_created` (`user_id`,`deleted_at`,`created_at`,`id`),
  KEY `idx_image_assets_cleanup` (`oss_cleanup_status`,`oss_cleanup_available_at`),
  CONSTRAINT `fk_image_assets_origin_task_id` FOREIGN KEY (`origin_task_id`) REFERENCES `executions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_image_assets_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `image_publications` (
  `asset_id` bigint unsigned NOT NULL,
  `review_status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NONE',
  `publication_version` bigint unsigned NOT NULL DEFAULT '0',
  `review_attempt_count` tinyint unsigned NOT NULL DEFAULT '0',
  `review_started_at` datetime(3) DEFAULT NULL,
  `title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `public_at` datetime(3) DEFAULT NULL,
  `like_count` bigint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`asset_id`),
  KEY `idx_image_publications_public_list` (`public_at` DESC,`asset_id` DESC),
  KEY `idx_image_publications_review_recovery` (`review_status`,`review_started_at`),
  CONSTRAINT `fk_image_publications_asset_id` FOREIGN KEY (`asset_id`) REFERENCES `image_assets` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `image_asset_likes` (
  `user_id` bigint unsigned NOT NULL,
  `asset_id` bigint unsigned NOT NULL,
  `publication_version` bigint unsigned NOT NULL,
  `liked_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`asset_id`,`publication_version`),
  KEY `idx_image_asset_likes_asset_version` (`asset_id`,`publication_version`),
  KEY `idx_image_asset_likes_user_list` (`user_id`,`liked_at` DESC,`asset_id` DESC),
  CONSTRAINT `fk_image_asset_likes_asset_id` FOREIGN KEY (`asset_id`) REFERENCES `image_assets` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_image_asset_likes_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `recipient_user_id` bigint unsigned NOT NULL,
  `category` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_user_id` bigint unsigned DEFAULT NULL,
  `asset_id` bigint unsigned DEFAULT NULL,
  `publication_version` bigint unsigned DEFAULT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata_json` json DEFAULT NULL,
  `read_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_interaction_image_like_notification` (`recipient_user_id`,`actor_user_id`,`asset_id`,`publication_version`,`event_type`),
  KEY `idx_notifications_recipient_list` (`recipient_user_id`,`category`,`deleted_at`,`created_at` DESC,`id` DESC),
  KEY `idx_notifications_recipient_unread` (`recipient_user_id`,`category`,`deleted_at`,`read_at`),
  KEY `idx_notifications_actor_user_id` (`actor_user_id`),
  KEY `fk_user_notifications_asset_id` (`asset_id`),
  CONSTRAINT `fk_user_notifications_actor_user_id` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_user_notifications_asset_id` FOREIGN KEY (`asset_id`) REFERENCES `image_assets` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_user_notifications_recipient_user_id` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_generation_daily_usage` (
  `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  `usage_date` date NOT NULL COMMENT '按北京时间计算的业务自然日',
  `requested_image_count` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '当日已请求图片数量',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '最近额度占用时间',
  PRIMARY KEY (`user_id`,`usage_date`),
  CONSTRAINT `fk_user_generation_daily_usage_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户每日生成图片额度表';

CREATE TABLE `outbox_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `aggregate_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `aggregate_id` bigint unsigned NOT NULL,
  `aggregate_version` bigint unsigned NOT NULL,
  `payload_json` json DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `retry_count` int unsigned NOT NULL DEFAULT '0',
  `available_at` datetime(3) NOT NULL,
  `locked_at` datetime(3) DEFAULT NULL,
  `published_at` datetime(3) DEFAULT NULL,
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_outbox_events_status_available` (`status`,`available_at`),
  KEY `idx_outbox_events_published_cleanup` (`status`,`published_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
