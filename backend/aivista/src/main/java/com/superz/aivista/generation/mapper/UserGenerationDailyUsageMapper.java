package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.UserGenerationDailyUsage;
import java.time.LocalDate;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 用户每日生成用量数据访问接口。 */
public interface UserGenerationDailyUsageMapper extends BaseMapper<UserGenerationDailyUsage> {

    @Select("""
            SELECT user_id, usage_date, requested_image_count, updated_at
            FROM user_generation_daily_usage
            WHERE user_id = #{userId} AND usage_date = #{usageDate}
            FOR UPDATE
            """)
    UserGenerationDailyUsage selectByUserIdAndUsageDateForUpdate(
            @Param("userId") long userId,
            @Param("usageDate") LocalDate usageDate);

    @Update("""
            UPDATE user_generation_daily_usage
            SET requested_image_count = requested_image_count + #{imageCount},
                updated_at = #{updatedAt}
            WHERE user_id = #{userId}
              AND usage_date = #{usageDate}
              AND requested_image_count + #{imageCount} <= #{dailyQuota}
            """)
    int incrementWithinQuota(
            @Param("userId") long userId,
            @Param("usageDate") LocalDate usageDate,
            @Param("imageCount") int imageCount,
            @Param("dailyQuota") int dailyQuota,
            @Param("updatedAt") java.time.Instant updatedAt);
}
