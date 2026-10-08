ALTER TABLE generation_sessions
  ADD COLUMN deleted_at datetime(3) DEFAULT NULL COMMENT '会话逻辑删除时间',
  DROP INDEX idx_generation_sessions_user_last_message,
  ADD KEY idx_generation_sessions_user_visible_message (user_id, deleted_at, last_message_at, id);
