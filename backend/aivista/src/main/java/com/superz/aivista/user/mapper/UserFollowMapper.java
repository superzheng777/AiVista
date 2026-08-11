package com.superz.aivista.user.mapper;

import java.time.Instant;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface UserFollowMapper {
    @Insert("INSERT IGNORE INTO user_follows (follower_user_id, following_user_id, created_at) VALUES (#{followerUserId}, #{followingUserId}, #{createdAt})")
    int insertIfAbsent(@Param("followerUserId") long followerUserId,
            @Param("followingUserId") long followingUserId, @Param("createdAt") Instant createdAt);

    @Delete("DELETE FROM user_follows WHERE follower_user_id = #{followerUserId} AND following_user_id = #{followingUserId}")
    int delete(@Param("followerUserId") long followerUserId, @Param("followingUserId") long followingUserId);

    @Select("SELECT follower_user_id FROM user_follows WHERE follower_user_id = #{followerUserId} AND following_user_id = #{followingUserId}")
    Long selectFollowerUserId(@Param("followerUserId") long followerUserId,
            @Param("followingUserId") long followingUserId);
}
