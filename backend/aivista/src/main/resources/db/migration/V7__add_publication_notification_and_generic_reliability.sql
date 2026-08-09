ALTER TABLE `generation_images`
    ADD COLUMN `favorited` BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN `public_at` DATETIME(3) DEFAULT NULL,
    ADD COLUMN `publication_review_status` VARCHAR(16) NOT NULL DEFAULT 'NONE',
    ADD COLUMN `publication_version` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `publication_review_attempt_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `publication_review_started_at` DATETIME(3) DEFAULT NULL,
    ADD COLUMN `publication_title` VARCHAR(100) DEFAULT NULL,
    ADD COLUMN `publication_description` VARCHAR(500) DEFAULT NULL,
    ADD KEY `idx_generation_images_user_favorited_visible_created` (`user_id`, `favorited`, `deleted_at`, `created_at` DESC, `id` DESC),
    ADD KEY `idx_generation_images_public_list` (`public_at` DESC, `id` DESC),
    ADD KEY `idx_generation_images_review_recovery` (`publication_review_status`, `publication_review_started_at`);

CREATE TABLE `user_notifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `recipient_user_id` BIGINT UNSIGNED NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `event_type` VARCHAR(64) NOT NULL,
    `image_id` BIGINT UNSIGNED DEFAULT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` VARCHAR(500) NOT NULL,
    `read_at` DATETIME(3) DEFAULT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_notifications_recipient_list` (`recipient_user_id`, `category`, `deleted_at`, `created_at` DESC, `id` DESC),
    KEY `idx_notifications_recipient_unread` (`recipient_user_id`, `category`, `deleted_at`, `read_at`),
    CONSTRAINT `fk_user_notifications_recipient_user_id`
        FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_user_notifications_image_id`
        FOREIGN KEY (`image_id`) REFERENCES `generation_images` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `idempotency_records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `owner_id` BIGINT UNSIGNED NOT NULL,
    `scope` VARCHAR(64) NOT NULL,
    `idempotency_key` CHAR(36) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `resource_type` VARCHAR(64) NOT NULL,
    `resource_id` BIGINT UNSIGNED NOT NULL,
    `response_status` SMALLINT UNSIGNED NOT NULL,
    `response_body` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_idempotency_records_owner_scope_key` (`owner_id`, `scope`, `idempotency_key`),
    KEY `idx_idempotency_records_expires_at` (`expires_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE `generation_tasks`
    DROP INDEX `uk_generation_tasks_user_idempotency`,
    DROP COLUMN `idempotency_key`,
    DROP COLUMN `request_fingerprint`;

DROP TABLE `outbox_events`;

CREATE TABLE `outbox_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_type` VARCHAR(64) NOT NULL,
    `aggregate_type` VARCHAR(64) NOT NULL,
    `aggregate_id` BIGINT UNSIGNED NOT NULL,
    `aggregate_version` BIGINT UNSIGNED NOT NULL,
    `payload_json` JSON DEFAULT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `retry_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `available_at` DATETIME(3) NOT NULL,
    `locked_at` DATETIME(3) DEFAULT NULL,
    `published_at` DATETIME(3) DEFAULT NULL,
    `last_error` VARCHAR(500) DEFAULT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    KEY `idx_outbox_events_status_available` (`status`, `available_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
