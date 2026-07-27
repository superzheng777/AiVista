package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 用户按北京时间自然日统计的生成图片用量。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "user_generation_daily_usage", mapperGenerateEnable = false)
public class UserGenerationDailyUsage {
    /** 与 usageDate 共同组成联合主键。 */
    private Long userId;
    /** 由服务端按 Asia/Shanghai 计算，不能用数据库 UTC 日期替代。 */
    private LocalDate usageDate;
    private Integer requestedImageCount;
    private Instant updatedAt;
}
