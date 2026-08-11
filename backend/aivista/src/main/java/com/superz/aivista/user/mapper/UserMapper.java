package com.superz.aivista.user.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.user.entity.User;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 用户表数据访问接口。 */
public interface UserMapper extends BaseMapper<User> {

    @Select("""
            SELECT id, login_name, password_hash, nickname, avatar_url, bio, created_at, updated_at
            FROM users
            WHERE login_name = #{loginName}
            LIMIT 1
            """)
    User selectByLoginName(@Param("loginName") String loginName);

    @Select("SELECT id FROM users WHERE id = #{userId} FOR UPDATE")
    Long selectIdForUpdate(@Param("userId") long userId);

    @Update("UPDATE users SET received_like_count = received_like_count + #{delta} WHERE id = #{userId} AND received_like_count + #{delta} >= 0")
    int changeReceivedLikeCount(@Param("userId") long userId, @Param("delta") int delta);

    @Select("SELECT likes_public FROM users WHERE id = #{userId}")
    Boolean selectLikesPublicById(@Param("userId") long userId);

    @Update("UPDATE users SET likes_public = #{likesPublic} WHERE id = #{userId}")
    int updateLikesPublic(@Param("userId") long userId, @Param("likesPublic") boolean likesPublic);

    @Update("""
            UPDATE users
            SET nickname = #{nickname}, avatar_url = #{avatarUrl}, bio = #{bio}
            WHERE id = #{userId}
            """)
    int updateProfile(
            @Param("userId") long userId,
            @Param("nickname") String nickname,
            @Param("avatarUrl") String avatarUrl,
            @Param("bio") String bio);
}
