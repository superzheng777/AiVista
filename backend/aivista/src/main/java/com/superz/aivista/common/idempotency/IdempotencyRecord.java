package com.superz.aivista.common.idempotency;

import com.mybatisflex.annotation.Id;
import com.mybatisflex.annotation.KeyType;
import com.mybatisflex.annotation.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Table(value = "idempotency_records", mapperGenerateEnable = false)
public class IdempotencyRecord {
    @Id(keyType = KeyType.Auto)
    private Long id;
    private Long ownerId;
    private String scope;
    private String idempotencyKey;
    private String requestFingerprint;
    private String resourceType;
    private Long resourceId;
    private Integer responseStatus;
    private String responseBody;
    private Instant createdAt;
    private Instant expiresAt;
}
