ALTER TABLE `creation_tasks`
    ADD COLUMN `requested_aspect_ratio` VARCHAR(8) NOT NULL DEFAULT 'AUTO'
        COMMENT 'Agent本轮画幅约束，AUTO表示由模型决定' AFTER `mode`,
    ADD COLUMN `requested_image_count` TINYINT UNSIGNED NOT NULL DEFAULT 0
        COMMENT 'Agent本轮目标图片数，0表示由模型决定' AFTER `requested_aspect_ratio`,
    ADD CONSTRAINT `chk_creation_tasks_requested_aspect_ratio`
        CHECK (`requested_aspect_ratio` IN ('AUTO', '1:1', '4:3', '3:4', '16:9', '9:16')),
    ADD CONSTRAINT `chk_creation_tasks_requested_image_count`
        CHECK (`requested_image_count` BETWEEN 0 AND 6);
