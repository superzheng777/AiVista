ALTER TABLE `creation_forms`
    MODIFY COLUMN `form_json` JSON NOT NULL
        COMMENT '标题、字段、选项、当前值及 Schema 版本',
    DROP COLUMN `answer_json`;
