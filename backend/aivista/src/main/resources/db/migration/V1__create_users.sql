CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户唯一ID',
    `login_name` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户登录账号，不作为公开展示昵称，大小写不敏感',
    `password_hash` VARCHAR(255) NOT NULL COMMENT '密码哈希值，不保存明文密码',
    `nickname` VARCHAR(32) NOT NULL COMMENT '用户公开展示昵称，允许重名',
    `avatar_url` VARCHAR(512) DEFAULT NULL COMMENT '用户头像地址',
    `bio` VARCHAR(500) DEFAULT NULL COMMENT '用户个人简介',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',

    PRIMARY KEY (`id`) COMMENT '用户主键索引',
    UNIQUE KEY `uk_users_login_name` (`login_name`) COMMENT '登录账号唯一索引，基于大小写不敏感排序规则生效'
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'AiVista普通用户基础信息表';
