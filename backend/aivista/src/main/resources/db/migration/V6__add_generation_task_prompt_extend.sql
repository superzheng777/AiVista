ALTER TABLE `generation_tasks`
    ADD COLUMN `prompt_extend` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Whether Bailian optimizes the prompt';
