ALTER TABLE `generation_images`
    ADD COLUMN `favorited` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether the owner favorited this image',
    ADD COLUMN `publication_state` VARCHAR(16) NOT NULL DEFAULT 'NONE'
        COMMENT 'Internal publication state: NONE, QUEUED, PROCESSING, PUBLISHED',
    ADD COLUMN `current_publication_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Current publication ID for stale-update protection',
    ADD COLUMN `publication_version` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Current publication relation version',
    ADD KEY `idx_generation_images_user_favorited_visible_created` (`user_id`, `favorited`, `deleted_at`, `created_at` DESC, `id` DESC);

CREATE TABLE `image_publications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Publication ID',
    `image_id` BIGINT UNSIGNED NOT NULL COMMENT 'Source generation image ID',
    `source_task_id` BIGINT UNSIGNED NOT NULL COMMENT 'Source generation task ID',
    `owner_id` BIGINT UNSIGNED NOT NULL COMMENT 'Publication owner user ID',
    `title` VARCHAR(100) NOT NULL COMMENT 'User supplied publication title',
    `description` VARCHAR(500) DEFAULT NULL COMMENT 'User supplied publication description',
    `status` VARCHAR(16) NOT NULL DEFAULT 'QUEUED' COMMENT 'QUEUED, PROCESSING, PUBLISHED, or FAILED',
    `publication_token` CHAR(36) NOT NULL COMMENT 'Internal UUID for immutable publication object keys',
    `snapshot_object_key` VARCHAR(512) NOT NULL COMMENT 'Private immutable publication snapshot object key',
    `public_object_key` VARCHAR(512) NOT NULL COMMENT 'Immutable public publication object key',
    `publish_attempt_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Publication execution attempts',
    `failure_code` VARCHAR(64) DEFAULT NULL COMMENT 'Internal stable failure classification',
    `version` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Publication optimistic-lock version',
    `snapshot_cleanup_status` VARCHAR(16) NOT NULL DEFAULT 'NONE' COMMENT 'NONE, PENDING, PROCESSING, or DONE',
    `snapshot_cleanup_attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Private snapshot cleanup attempts',
    `snapshot_cleanup_next_attempt_at` DATETIME(3) DEFAULT NULL COMMENT 'Next private snapshot cleanup attempt time',
    `snapshot_cleanup_locked_at` DATETIME(3) DEFAULT NULL COMMENT 'Private snapshot cleanup claim time',
    `snapshot_cleanup_last_error` VARCHAR(500) DEFAULT NULL COMMENT 'Safe private snapshot cleanup error summary',
    `public_cleanup_status` VARCHAR(16) NOT NULL DEFAULT 'NONE' COMMENT 'NONE, PENDING, PROCESSING, or DONE',
    `public_cleanup_attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Public object cleanup attempts',
    `public_cleanup_next_attempt_at` DATETIME(3) DEFAULT NULL COMMENT 'Next public object cleanup attempt time',
    `public_cleanup_locked_at` DATETIME(3) DEFAULT NULL COMMENT 'Public object cleanup claim time',
    `public_cleanup_last_error` VARCHAR(500) DEFAULT NULL COMMENT 'Safe public object cleanup error summary',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Creation time',
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last update time',
    `completed_at` DATETIME(3) DEFAULT NULL COMMENT 'Publication terminal time',
    `deleted_at` DATETIME(3) DEFAULT NULL COMMENT 'Revocation time',
    `active_image_id` BIGINT UNSIGNED GENERATED ALWAYS AS (
        CASE
            WHEN `deleted_at` IS NULL AND `status` IN ('QUEUED', 'PROCESSING', 'PUBLISHED') THEN `image_id`
            ELSE NULL
        END
    ) STORED COMMENT 'Image ID only while this publication is active',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_publications_snapshot_object_key` (`snapshot_object_key`),
    UNIQUE KEY `uq_publications_active_image` (`active_image_id`),
    KEY `idx_publications_owner_list` (`owner_id`, `deleted_at`, `created_at` DESC, `id` DESC),
    KEY `idx_publications_processing_recovery` (`status`, `updated_at`),
    KEY `idx_publications_snapshot_cleanup` (`snapshot_cleanup_status`, `snapshot_cleanup_next_attempt_at`, `snapshot_cleanup_locked_at`),
    KEY `idx_publications_public_cleanup` (`public_cleanup_status`, `public_cleanup_next_attempt_at`, `public_cleanup_locked_at`),
    CONSTRAINT `fk_image_publications_image_id`
        FOREIGN KEY (`image_id`) REFERENCES `generation_images` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_image_publications_source_task_id`
        FOREIGN KEY (`source_task_id`) REFERENCES `generation_tasks` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_image_publications_owner_id`
        FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Image publication records';

CREATE TABLE `user_notifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Notification ID',
    `recipient_user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Notification recipient user ID',
    `category` VARCHAR(32) NOT NULL COMMENT 'Current category: OFFICIAL',
    `event_type` VARCHAR(64) NOT NULL COMMENT 'Current event: PUBLICATION_FAILED',
    `image_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Optional related generation image ID',
    `publication_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Optional related publication ID',
    `title` VARCHAR(200) NOT NULL COMMENT 'Safe user-visible title',
    `content` VARCHAR(500) NOT NULL COMMENT 'Safe user-visible content',
    `read_at` DATETIME(3) DEFAULT NULL COMMENT 'Read time',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Creation time',
    `deleted_at` DATETIME(3) DEFAULT NULL COMMENT 'Soft deletion time',
    PRIMARY KEY (`id`),
    KEY `idx_notifications_recipient_list` (`recipient_user_id`, `category`, `deleted_at`, `created_at` DESC, `id` DESC),
    KEY `idx_notifications_recipient_unread` (`recipient_user_id`, `category`, `deleted_at`, `read_at`),
    CONSTRAINT `fk_user_notifications_recipient_user_id`
        FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_user_notifications_image_id`
        FOREIGN KEY (`image_id`) REFERENCES `generation_images` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_user_notifications_publication_id`
        FOREIGN KEY (`publication_id`) REFERENCES `image_publications` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = 'User notifications';

CREATE TABLE `idempotency_records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Idempotency record ID',
    `owner_id` BIGINT UNSIGNED NOT NULL COMMENT 'Command owner user ID',
    `scope` VARCHAR(64) NOT NULL COMMENT 'Command scope, for example GENERATION_TASK_CREATE',
    `idempotency_key` CHAR(36) NOT NULL COMMENT 'Client UUID v4 idempotency key',
    `request_fingerprint` CHAR(64) NOT NULL COMMENT 'Normalized request SHA-256 fingerprint',
    `resource_type` VARCHAR(64) NOT NULL COMMENT 'Created resource type',
    `resource_id` BIGINT UNSIGNED NOT NULL COMMENT 'Created resource ID',
    `response_status` SMALLINT UNSIGNED NOT NULL COMMENT 'First safe HTTP response status',
    `response_body` JSON NOT NULL COMMENT 'First safe HTTP response body',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Creation time',
    `expires_at` DATETIME(3) NOT NULL COMMENT 'Idempotency retention expiry time',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_idempotency_records_owner_scope_key` (`owner_id`, `scope`, `idempotency_key`),
    KEY `idx_idempotency_records_expires_at` (`expires_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Generic create-command idempotency records';

ALTER TABLE `generation_tasks`
    DROP INDEX `uk_generation_tasks_user_idempotency`,
    DROP COLUMN `idempotency_key`,
    DROP COLUMN `request_fingerprint`;

DROP TABLE `outbox_events`;

CREATE TABLE `outbox_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Outbox event ID',
    `event_type` VARCHAR(64) NOT NULL COMMENT 'Consumer action type',
    `aggregate_type` VARCHAR(64) NOT NULL COMMENT 'Aggregate type',
    `aggregate_id` BIGINT UNSIGNED NOT NULL COMMENT 'Aggregate ID',
    `aggregate_version` BIGINT UNSIGNED NOT NULL COMMENT 'Aggregate version',
    `payload_json` JSON DEFAULT NULL COMMENT 'Safe immutable event payload',
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING, PROCESSING, PUBLISHED, or FAILED',
    `retry_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Delivery attempts',
    `available_at` DATETIME(3) NOT NULL COMMENT 'Next delivery time',
    `locked_at` DATETIME(3) DEFAULT NULL COMMENT 'Dispatcher claim time',
    `published_at` DATETIME(3) DEFAULT NULL COMMENT 'Successful delivery time',
    `last_error` VARCHAR(500) DEFAULT NULL COMMENT 'Safe error summary',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Creation time',
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last update time',
    PRIMARY KEY (`id`),
    KEY `idx_outbox_events_status_available` (`status`, `available_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Generic reliable event outbox';
