package com.superz.aivista.user.entity;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Table(value = "user_stats", mapperGenerateEnable = false)
public class UserStats {
    @Id
    private Long userId;
    private Long followerCount;
    private Long followingCount;
    private Long receivedLikeCount;
}
