package com.superz.aivista.user.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Official notification associated with a user's generated image. */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "user_notifications", mapperGenerateEnable = false)
public class UserNotification {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long recipientUserId;
    private String category;
    private String eventType;
    private Long imageId;
    private String title;
    private String content;
    private String metadataJson;
    private Instant readAt;
    private Instant createdAt;
    private Instant deletedAt;
}
