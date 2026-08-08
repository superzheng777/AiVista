package com.superz.aivista.common.idempotency;

import com.mybatisflex.core.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface IdempotencyRecordMapper extends BaseMapper<IdempotencyRecord> {
    @Select("""
            SELECT id, owner_id, scope, idempotency_key, request_fingerprint, resource_type, resource_id,
                   response_status, response_body, created_at, expires_at
            FROM idempotency_records
            WHERE owner_id = #{ownerId} AND scope = #{scope} AND idempotency_key = #{idempotencyKey}
            LIMIT 1
            """)
    IdempotencyRecord selectByOwnerScopeAndKey(@Param("ownerId") long ownerId,
            @Param("scope") String scope, @Param("idempotencyKey") String idempotencyKey);
}
