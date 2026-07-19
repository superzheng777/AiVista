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
