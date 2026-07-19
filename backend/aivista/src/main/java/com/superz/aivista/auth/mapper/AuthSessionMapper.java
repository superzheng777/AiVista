package com.superz.aivista.auth.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.auth.entity.AuthSession;
import java.time.Instant;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 认证会话表数据访问接口。 */
public interface AuthSessionMapper extends BaseMapper<AuthSession> {

    @Select("""
            SELECT id, user_id, client_type, refresh_token_hash, expires_at, created_at, updated_at
            FROM auth_sessions
            WHERE refresh_token_hash = #{refreshTokenHash}
            LIMIT 1
            """)
    AuthSession selectByRefreshTokenHash(@Param("refreshTokenHash") byte[] refreshTokenHash);

    @Update("""
            UPDATE auth_sessions
            SET refresh_token_hash = #{newHash}
            WHERE id = #{sessionId}
              AND refresh_token_hash = #{oldHash}
              AND expires_at > #{now}
            """)
    int rotateRefreshToken(
            @Param("sessionId") long sessionId,
            @Param("oldHash") byte[] oldHash,
            @Param("newHash") byte[] newHash,
            @Param("now") Instant now);

    @Delete("""
            DELETE FROM auth_sessions
            WHERE refresh_token_hash = #{refreshTokenHash}
            """)
    int deleteByRefreshTokenHash(@Param("refreshTokenHash") byte[] refreshTokenHash);

    @Delete("""
            DELETE FROM auth_sessions
            WHERE expires_at < #{expiredBefore}
            ORDER BY id
            LIMIT #{batchSize}
            """)
    int deleteExpiredBatch(
            @Param("expiredBefore") Instant expiredBefore,
            @Param("batchSize") int batchSize);
}
