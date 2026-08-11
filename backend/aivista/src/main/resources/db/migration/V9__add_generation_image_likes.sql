ALTER TABLE `users`
    ADD COLUMN `received_like_count` BIGINT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE `generation_images`
    ADD COLUMN `like_count` BIGINT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE `generation_image_likes` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `image_id` BIGINT UNSIGNED NOT NULL,
    `publication_version` BIGINT UNSIGNED NOT NULL,
    `liked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`user_id`, `image_id`, `publication_version`),
    KEY `idx_generation_image_likes_image_version` (`image_id`, `publication_version`),
    KEY `idx_generation_image_likes_user_list` (`user_id`, `liked_at` DESC, `image_id` DESC),
    CONSTRAINT `fk_generation_image_likes_user_id`
        FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_generation_image_likes_image_id`
        FOREIGN KEY (`image_id`) REFERENCES `generation_images` (`id`) ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
