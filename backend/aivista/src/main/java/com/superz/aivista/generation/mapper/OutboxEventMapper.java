package com.superz.aivista.generation.mapper;

import com.mybatisflex.core.BaseMapper;
import com.superz.aivista.generation.entity.OutboxEvent;
import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** Project-wide reliable event data access. */
public interface OutboxEventMapper extends BaseMapper<OutboxEvent> {
    @Delete("""
            DELETE FROM outbox_events
            WHERE status = 'PUBLISHED' AND published_at < #{publishedBefore}
            ORDER BY published_at, id
            LIMIT #{batchSize}
            """)
    int deletePublishedBefore(@Param("publishedBefore") Instant publishedBefore, @Param("batchSize") int batchSize);

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

    @Select("""
            SELECT id, event_type, aggregate_type, aggregate_id, aggregate_version, payload_json,
                   status, retry_count, available_at, locked_at, published_at, last_error, created_at, updated_at
            FROM outbox_events
            WHERE event_type = #{eventType}
              AND status = 'PROCESSING'
              AND locked_at < #{lockedBefore}
            ORDER BY locked_at
            LIMIT #{limit}
            """)
    List<OutboxEvent> selectProcessingLockedBefore(@Param("eventType") String eventType,
            @Param("lockedBefore") Instant lockedBefore, @Param("limit") int limit);

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
            <script>
            UPDATE outbox_events
            SET status = 'PUBLISHED', published_at = #{publishedAt}, locked_at = NULL, last_error = NULL
            WHERE status = 'PROCESSING' AND id IN
            <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
            </script>
            """)
    int markPublishedBatch(@Param("ids") List<Long> ids, @Param("publishedAt") Instant publishedAt);

    @Update("""
            UPDATE outbox_events
            SET status = 'PENDING', retry_count = #{retryCount}, available_at = #{availableAt},
                locked_at = NULL, last_error = #{lastError}
            WHERE id = #{id} AND status = 'PROCESSING'
            """)
    int reschedule(@Param("id") long id, @Param("retryCount") int retryCount,
            @Param("availableAt") Instant availableAt, @Param("lastError") String lastError);

    @Update("""
            <script>
            UPDATE outbox_events
            SET status = 'PENDING',
                retry_count = CASE id
                <foreach collection="events" item="event">
                    WHEN #{event.id} THEN #{event.retryCount}
                </foreach>
                ELSE retry_count END,
                available_at = CASE id
                <foreach collection="events" item="event">
                    WHEN #{event.id} THEN #{event.availableAt}
                </foreach>
                ELSE available_at END,
                locked_at = NULL, last_error = #{lastError}
            WHERE status = 'PROCESSING' AND id IN
            <foreach collection="events" item="event" open="(" separator="," close=")">#{event.id}</foreach>
            </script>
            """)
    int rescheduleBatch(@Param("events") List<OutboxEvent> events, @Param("lastError") String lastError);

    @Update("""
            UPDATE outbox_events
            SET status = 'FAILED', locked_at = NULL, last_error = #{lastError}
            WHERE id = #{id} AND status = 'PROCESSING'
            """)
    int markFailed(@Param("id") long id, @Param("lastError") String lastError);

    @Update("""
            <script>
            UPDATE outbox_events
            SET status = 'FAILED', locked_at = NULL, last_error = #{lastError}
            WHERE status = 'PROCESSING' AND id IN
            <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
            </script>
            """)
    int markFailedBatch(@Param("ids") List<Long> ids, @Param("lastError") String lastError);

    @Select("SELECT COALESCE(MAX(id), 0) FROM outbox_events")
    long selectMaxId();

    @Select("""
            SELECT id, event_type, aggregate_type, aggregate_id, aggregate_version, payload_json,
                   status, retry_count, available_at, locked_at, published_at, last_error, created_at, updated_at
            FROM outbox_events
            WHERE event_type = #{eventType} AND id > #{afterId} AND id <= #{throughId}
            ORDER BY id
            LIMIT #{limit}
            """)
    List<OutboxEvent> selectByEventTypeAndIdRange(@Param("eventType") String eventType,
            @Param("afterId") long afterId, @Param("throughId") long throughId, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM outbox_events WHERE event_type = #{eventType} AND status = 'FAILED'")
    long countFailedByEventType(@Param("eventType") String eventType);

    @Select("""
            SELECT MIN(created_at) FROM outbox_events
            WHERE event_type = #{eventType} AND status IN ('PENDING', 'PROCESSING')
            """)
    Instant selectOldestIncompleteCreatedAt(@Param("eventType") String eventType);
}
