package com.superz.aivista.user.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.user.entity.UserNotification;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** Official notification persistence. */
public interface UserNotificationMapper extends BaseMapper<UserNotification> {
    @Insert("INSERT INTO user_notifications (recipient_user_id, category, event_type, actor_user_id, title, content, metadata_json, created_at) VALUES (#{recipientUserId}, #{category}, #{eventType}, #{actorUserId}, #{title}, #{content}, #{metadataJson}, #{createdAt})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertInteraction(UserNotification notification);

    @Insert("INSERT IGNORE INTO user_notifications (recipient_user_id, category, event_type, actor_user_id, asset_id, publication_version, title, content, metadata_json, created_at) VALUES (#{recipientUserId}, #{category}, #{eventType}, #{actorUserId}, #{assetId}, #{publicationVersion}, #{title}, #{content}, #{metadataJson}, #{createdAt})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertImageLikeInteractionIfAbsent(UserNotification notification);

    @Select("""
            <script>
            SELECT id, recipient_user_id, category, event_type, actor_user_id,
                   asset_id, publication_version, title, content,
                   metadata_json, read_at, created_at, deleted_at
            FROM user_notifications
            WHERE recipient_user_id = #{userId}
              AND category = 'INTERACTION'
              AND deleted_at IS NULL
            <if test="cursorCreatedAt != null">
              AND (created_at &lt; #{cursorCreatedAt}
                   OR (created_at = #{cursorCreatedAt} AND id &lt; #{cursorNotificationId}))
            </if>
            ORDER BY created_at DESC, id DESC
            LIMIT #{limit}
            </script>
            """)
    List<UserNotification> selectInteractionPageByRecipientUserId(
            @Param("userId") long userId,
            @Param("cursorCreatedAt") Instant cursorCreatedAt,
            @Param("cursorNotificationId") Long cursorNotificationId,
            @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM user_notifications WHERE recipient_user_id = #{userId} AND category = 'INTERACTION' AND deleted_at IS NULL AND read_at IS NULL")
    long countUnreadInteractionByRecipientUserId(@Param("userId") long userId);

    @Update("UPDATE user_notifications SET read_at = COALESCE(read_at, #{readAt}) WHERE id = #{notificationId} AND recipient_user_id = #{userId} AND category = 'INTERACTION' AND deleted_at IS NULL")
    int markInteractionRead(@Param("notificationId") long notificationId, @Param("userId") long userId,
            @Param("readAt") Instant readAt);

    @Update("UPDATE user_notifications SET read_at = #{readAt} WHERE recipient_user_id = #{userId} AND category = 'INTERACTION' AND deleted_at IS NULL AND read_at IS NULL")
    int markAllInteractionRead(@Param("userId") long userId, @Param("readAt") Instant readAt);

    @Update("UPDATE user_notifications SET deleted_at = #{deletedAt} WHERE id = #{notificationId} AND recipient_user_id = #{userId} AND category = 'INTERACTION' AND deleted_at IS NULL")
    int softDeleteInteraction(@Param("notificationId") long notificationId, @Param("userId") long userId,
            @Param("deletedAt") Instant deletedAt);

    @Update("""
            <script>
            UPDATE user_notifications SET deleted_at = #{deletedAt}
            WHERE recipient_user_id = #{userId}
              AND category = 'INTERACTION'
              AND deleted_at IS NULL
              AND id IN
            <foreach collection="notificationIds" item="notificationId" open="(" separator="," close=")">#{notificationId}</foreach>
            </script>
            """)
    int softDeleteInteractions(@Param("userId") long userId, @Param("notificationIds") List<Long> notificationIds,
            @Param("deletedAt") Instant deletedAt);

    @Select("""
            <script>
            SELECT id, recipient_user_id, category, event_type, actor_user_id,
                   asset_id, publication_version, title, content,
                   metadata_json, read_at, created_at, deleted_at
            FROM user_notifications
            WHERE recipient_user_id = #{userId}
              AND category = 'OFFICIAL'
              AND deleted_at IS NULL
            <if test="cursorCreatedAt != null">
              AND (created_at &lt; #{cursorCreatedAt}
                   OR (created_at = #{cursorCreatedAt} AND id &lt; #{cursorNotificationId}))
            </if>
            ORDER BY created_at DESC, id DESC
            LIMIT #{limit}
            </script>
            """)
    List<UserNotification> selectOfficialPageByRecipientUserId(
            @Param("userId") long userId,
            @Param("cursorCreatedAt") Instant cursorCreatedAt,
            @Param("cursorNotificationId") Long cursorNotificationId,
            @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM user_notifications WHERE recipient_user_id = #{userId} AND category = 'OFFICIAL' AND deleted_at IS NULL AND read_at IS NULL")
    long countUnreadOfficialByRecipientUserId(@Param("userId") long userId);

    @Update("UPDATE user_notifications SET read_at = COALESCE(read_at, #{readAt}) WHERE id = #{notificationId} AND recipient_user_id = #{userId} AND category = 'OFFICIAL' AND deleted_at IS NULL")
    int markOfficialRead(@Param("notificationId") long notificationId, @Param("userId") long userId,
            @Param("readAt") Instant readAt);

    @Update("UPDATE user_notifications SET read_at = #{readAt} WHERE recipient_user_id = #{userId} AND category = 'OFFICIAL' AND deleted_at IS NULL AND read_at IS NULL")
    int markAllOfficialRead(@Param("userId") long userId, @Param("readAt") Instant readAt);

    @Update("UPDATE user_notifications SET deleted_at = #{deletedAt} WHERE id = #{notificationId} AND recipient_user_id = #{userId} AND category = 'OFFICIAL' AND deleted_at IS NULL")
    int softDeleteOfficial(@Param("notificationId") long notificationId, @Param("userId") long userId,
            @Param("deletedAt") Instant deletedAt);

    @Update("""
            <script>
            UPDATE user_notifications SET deleted_at = #{deletedAt}
            WHERE recipient_user_id = #{userId}
              AND category = 'OFFICIAL'
              AND deleted_at IS NULL
              AND id IN
            <foreach collection="notificationIds" item="notificationId" open="(" separator="," close=")">#{notificationId}</foreach>
            </script>
            """)
    int softDeleteOfficials(@Param("userId") long userId, @Param("notificationIds") List<Long> notificationIds,
            @Param("deletedAt") Instant deletedAt);

}
