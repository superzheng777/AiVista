package com.superz.aivista.user.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 普通用户持久化实体。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "users", mapperGenerateEnable = false)
public class User {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private String loginName;
    private String passwordHash;
    private String nickname;
    private String avatarUrl;
    private String bio;
    private Instant createdAt;
    private Instant updatedAt;
}
