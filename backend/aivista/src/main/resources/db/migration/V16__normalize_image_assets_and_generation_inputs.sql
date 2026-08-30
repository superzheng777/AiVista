-- The development database contains no production data. This migration deliberately
-- replaces the legacy generated-image model instead of copying it.
ALTER TABLE `generation_tasks`
    ADD COLUMN `operation` VARCHAR(32) NOT NULL DEFAULT 'TEXT_TO_IMAGE' AFTER `creation_task_id`;

CREATE TABLE `image_assets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `origin` VARCHAR(16) NOT NULL COMMENT 'UPLOADED or GENERATED',
    `lifecycle` VARCHAR(16) NOT NULL COMMENT 'TEMPORARY or PERSISTENT',
    `origin_task_id` BIGINT UNSIGNED DEFAULT NULL,
    `source_index` TINYINT UNSIGNED DEFAULT NULL,
    `object_key` VARCHAR(512) NOT NULL,
    `original_object_key` VARCHAR(512) NOT NULL,
    `content_type` VARCHAR(64) NOT NULL,
    `file_size` BIGINT UNSIGNED NOT NULL,
    `width` INT UNSIGNED NOT NULL,
    `height` INT UNSIGNED NOT NULL,
    `is_favorited` BOOLEAN NOT NULL DEFAULT FALSE,
    `deleted_at` DATETIME(3) DEFAULT NULL,
    `expires_at` DATETIME(3) DEFAULT NULL,
    `oss_cleanup_status` VARCHAR(16) DEFAULT NULL,
    `oss_cleanup_attempt_count` INT UNSIGNED NOT NULL DEFAULT 0,
    `oss_cleanup_available_at` DATETIME(3) DEFAULT NULL,
    `oss_cleanup_last_error` VARCHAR(512) DEFAULT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_image_assets_origin_task_source` (`origin_task_id`, `source_index`),
    KEY `idx_image_assets_user_visible_created` (`user_id`, `deleted_at`, `created_at`, `id`),
    KEY `idx_image_assets_cleanup` (`oss_cleanup_status`, `oss_cleanup_available_at`),
    CONSTRAINT `fk_image_assets_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_image_assets_origin_task_id`
        FOREIGN KEY (`origin_task_id`) REFERENCES `generation_tasks` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `generation_task_input_assets` (
    `task_id` BIGINT UNSIGNED NOT NULL,
    `asset_id` BIGINT UNSIGNED NOT NULL,
    `source_index` TINYINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`task_id`, `source_index`),
    UNIQUE KEY `uk_generation_task_input_assets_task_asset` (`task_id`, `asset_id`),
    KEY `idx_generation_task_input_assets_asset` (`asset_id`),
    CONSTRAINT `fk_generation_task_input_assets_task_id`
        FOREIGN KEY (`task_id`) REFERENCES `generation_tasks` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_generation_task_input_assets_asset_id`
        FOREIGN KEY (`asset_id`) REFERENCES `image_assets` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `creation_task_input_assets` (
    `creation_task_id` BIGINT UNSIGNED NOT NULL,
    `image_asset_id` BIGINT UNSIGNED NOT NULL,
    `source_index` TINYINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`creation_task_id`, `source_index`),
    UNIQUE KEY `uk_creation_task_input_assets_task_asset` (`creation_task_id`, `image_asset_id`),
    KEY `idx_creation_task_input_assets_asset` (`image_asset_id`),
    CONSTRAINT `fk_creation_task_input_assets_creation_task_id`
        FOREIGN KEY (`creation_task_id`) REFERENCES `creation_tasks` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_creation_task_input_assets_image_asset_id`
        FOREIGN KEY (`image_asset_id`) REFERENCES `image_assets` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `image_publications` (
    `asset_id` BIGINT UNSIGNED NOT NULL,
    `review_status` VARCHAR(16) NOT NULL DEFAULT 'NONE',
    `publication_version` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `review_attempt_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `review_started_at` DATETIME(3) DEFAULT NULL,
    `title` VARCHAR(100) DEFAULT NULL,
    `description` VARCHAR(500) DEFAULT NULL,
    `public_at` DATETIME(3) DEFAULT NULL,
    `like_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `allow_remix` BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (`asset_id`),
    KEY `idx_image_publications_public_list` (`public_at` DESC, `asset_id` DESC),
    KEY `idx_image_publications_review_recovery` (`review_status`, `review_started_at`),
    CONSTRAINT `fk_image_publications_asset_id`
        FOREIGN KEY (`asset_id`) REFERENCES `image_assets` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `image_asset_likes` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `asset_id` BIGINT UNSIGNED NOT NULL,
    `publication_version` BIGINT UNSIGNED NOT NULL,
    `liked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`user_id`, `asset_id`, `publication_version`),
    KEY `idx_image_asset_likes_asset_version` (`asset_id`, `publication_version`),
    KEY `idx_image_asset_likes_user_list` (`user_id`, `liked_at` DESC, `asset_id` DESC),
    CONSTRAINT `fk_image_asset_likes_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_image_asset_likes_asset_id`
        FOREIGN KEY (`asset_id`) REFERENCES `image_assets` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE `user_notifications`
    DROP FOREIGN KEY `fk_user_notifications_image_id`,
    CHANGE COLUMN `image_id` `asset_id` BIGINT UNSIGNED DEFAULT NULL,
    ADD CONSTRAINT `fk_user_notifications_asset_id`
        FOREIGN KEY (`asset_id`) REFERENCES `image_assets` (`id`) ON DELETE RESTRICT;

DROP TABLE `generation_image_likes`;
DROP TABLE `generation_images`;
