ALTER TABLE `users`
    ADD COLUMN `follower_count` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `following_count` BIGINT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE `user_follows` (
    `follower_user_id` BIGINT UNSIGNED NOT NULL,
    `following_user_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`follower_user_id`, `following_user_id`),
    KEY `idx_user_follows_following_user_id` (`following_user_id`, `follower_user_id`),
    CONSTRAINT `fk_user_follows_follower_user_id`
        FOREIGN KEY (`follower_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_user_follows_following_user_id`
        FOREIGN KEY (`following_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE `user_notifications`
    ADD COLUMN `actor_user_id` BIGINT UNSIGNED DEFAULT NULL AFTER `event_type`,
    ADD COLUMN `publication_version` BIGINT UNSIGNED DEFAULT NULL AFTER `image_id`,
    ADD KEY `idx_notifications_actor_user_id` (`actor_user_id`),
    ADD UNIQUE KEY `uq_interaction_image_like_notification`
        (`recipient_user_id`, `actor_user_id`, `image_id`, `publication_version`, `event_type`),
    ADD CONSTRAINT `fk_user_notifications_actor_user_id`
        FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT;
