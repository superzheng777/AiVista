ALTER TABLE `generation_images`
    ADD KEY `idx_generation_images_following_list`
        (`user_id`, `publication_review_status`, `public_at` DESC, `id` DESC);
