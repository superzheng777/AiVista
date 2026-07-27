package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.UserConsent;
import java.time.Instant;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 用户生成规则同意记录数据访问接口。 */
public interface UserConsentMapper extends BaseMapper<UserConsent> {

    @Select("""
            SELECT user_id, consent_type, policy_version, policy_content_hash, consented_at
            FROM user_consents
            WHERE user_id = #{userId} AND consent_type = #{consentType}
            """)
    UserConsent selectByUserIdAndConsentType(
            @Param("userId") long userId,
            @Param("consentType") String consentType);

    @Insert("""
            INSERT INTO user_consents (user_id, consent_type, policy_version, policy_content_hash, consented_at)
            VALUES (#{userId}, #{consentType}, #{policyVersion}, #{policyContentHash}, #{consentedAt})
            ON DUPLICATE KEY UPDATE
                policy_version = VALUES(policy_version),
                policy_content_hash = VALUES(policy_content_hash),
                consented_at = VALUES(consented_at)
            """)
    int upsert(
            @Param("userId") long userId,
            @Param("consentType") String consentType,
            @Param("policyVersion") String policyVersion,
            @Param("policyContentHash") String policyContentHash,
            @Param("consentedAt") Instant consentedAt);
}
