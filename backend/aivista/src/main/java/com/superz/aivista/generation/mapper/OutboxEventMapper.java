package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.OutboxEvent;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** Project-wide reliable event data access. */
public interface OutboxEventMapper extends BaseMapper<OutboxEvent> {
    @Select("""
            SELECT id, event_type, aggregate_type, aggregate_id, aggregate_version, payload_json,
                   status, retry_count, available_at, locked_at, published_at, last_error, created_at, updated_at
            FROM outbox_events
            WHERE event_type = #{eventType}
              AND status = 'PENDING'
              AND available_at <= #{now}
            ORDER BY id
            LIMIT #{limit}
            """)
    List<OutboxEvent> selectAvailableByEventType(@Param("eventType") String eventType,
            @Param("now") Instant now, @Param("limit") int limit);

    @Update("""
            UPDATE outbox_events
            SET status = 'PROCESSING', locked_at = #{lockedAt}
            WHERE id = #{id} AND status = 'PENDING' AND available_at <= #{now}
            """)
    int claimPending(@Param("id") long id, @Param("now") Instant now, @Param("lockedAt") Instant lockedAt);

    @Update("""
            UPDATE outbox_events
            SET status = 'PUBLISHED', published_at = #{publishedAt}, locked_at = NULL, last_error = NULL
            WHERE id = #{id} AND status = 'PROCESSING'
            """)
    int markPublished(@Param("id") long id, @Param("publishedAt") Instant publishedAt);

    @Update("""
            UPDATE outbox_events
            SET status = 'PENDING', retry_count = #{retryCount}, available_at = #{availableAt},
                locked_at = NULL, last_error = #{lastError}
            WHERE id = #{id} AND status = 'PROCESSING'
            """)
    int reschedule(@Param("id") long id, @Param("retryCount") int retryCount,
            @Param("availableAt") Instant availableAt, @Param("lastError") String lastError);

    @Update("""
            UPDATE outbox_events
            SET status = 'FAILED', locked_at = NULL, last_error = #{lastError}
            WHERE id = #{id} AND status = 'PROCESSING'
            """)
    int markFailed(@Param("id") long id, @Param("lastError") String lastError);
}
