CREATE TABLE `auth_sessions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '认证会话唯一ID',
    `user_id` BIGINT UNSIGNED NOT NULL COMMENT '会话所属用户ID',
    `client_type` VARCHAR(16) NOT NULL COMMENT '客户端类型，当前使用WEB并为后续APP预留',
    `refresh_token_hash` BINARY(32) NOT NULL COMMENT '当前Refresh Token的SHA-256哈希，不保存令牌明文',
    `expires_at` DATETIME NOT NULL COMMENT '会话最终过期时间，刷新不延长',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '会话创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '会话最后更新时间',

    PRIMARY KEY (`id`) COMMENT '认证会话主键索引',
    UNIQUE KEY `uk_auth_sessions_refresh_token_hash` (`refresh_token_hash`) COMMENT 'Refresh Token哈希唯一索引',
    KEY `idx_auth_sessions_user_id` (`user_id`) COMMENT '用户认证会话查询索引',
    KEY `idx_auth_sessions_expires_at` (`expires_at`) COMMENT '过期认证会话清理索引',
    CONSTRAINT `fk_auth_sessions_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `chk_auth_sessions_client_type`
        CHECK (`client_type` IN ('WEB', 'APP'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'AiVista用户认证会话表';
