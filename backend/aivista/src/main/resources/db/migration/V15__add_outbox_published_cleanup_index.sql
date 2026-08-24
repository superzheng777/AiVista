CREATE INDEX `idx_outbox_events_published_cleanup`
    ON `outbox_events` (`status`, `published_at`, `id`);
