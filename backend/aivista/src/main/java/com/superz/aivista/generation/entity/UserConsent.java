package com.superz.aivista.generation.entity;

import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 用户对当前生成数据处理规则的有效确认记录。 */
@Getter
@Setter
@NoArgsConstructor
@Table(value = "user_consents", mapperGenerateEnable = false)
public class UserConsent {
    /** 与 consentType 共同组成联合主键。 */
    private Long userId;
    private String consentType;
    private String policyVersion;
    /** 用户确认时展示文案的 SHA-256 摘要，用于追溯而不重复保存全文。 */
    private String policyContentHash;
    private Instant consentedAt;
}
