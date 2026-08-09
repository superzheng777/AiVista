package com.superz.aivista.user.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.user.entity.UserNotification;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** Official notification persistence. */
public interface UserNotificationMapper extends BaseMapper<UserNotification> {
    @Select("SELECT * FROM user_notifications WHERE recipient_user_id = #{userId} AND category = 'OFFICIAL' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC")
    List<UserNotification> selectOfficialByRecipientUserId(@Param("userId") long userId);

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

    @Update("UPDATE user_notifications SET deleted_at = #{deletedAt} WHERE recipient_user_id = #{userId} AND category = 'OFFICIAL' AND deleted_at IS NULL")
    int softDeleteAllOfficial(@Param("userId") long userId, @Param("deletedAt") Instant deletedAt);
}
