package com.superz.aivista.user.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.user.entity.UserStats;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface UserStatsMapper extends BaseMapper<UserStats> {
    @Insert("INSERT INTO user_stats (user_id) VALUES (#{userId})")
    int initialize(@Param("userId") long userId);

    @Update("UPDATE user_stats SET follower_count = follower_count + #{delta} WHERE user_id = #{userId} AND (#{delta} >= 0 OR follower_count >= -#{delta})")
    int changeFollowerCount(@Param("userId") long userId, @Param("delta") int delta);

    @Update("UPDATE user_stats SET following_count = following_count + #{delta} WHERE user_id = #{userId} AND (#{delta} >= 0 OR following_count >= -#{delta})")
    int changeFollowingCount(@Param("userId") long userId, @Param("delta") int delta);

    @Update("UPDATE user_stats SET received_like_count = received_like_count + #{delta} WHERE user_id = #{userId} AND (#{delta} >= 0 OR received_like_count >= -#{delta})")
    int changeReceivedLikeCount(@Param("userId") long userId, @Param("delta") int delta);
}
