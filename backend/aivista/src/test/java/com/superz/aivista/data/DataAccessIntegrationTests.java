package com.superz.aivista.data;

import static org.assertj.core.api.Assertions.assertThat;

import com.superz.aivista.auth.entity.AuthSession;
import com.superz.aivista.auth.mapper.AuthSessionMapper;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.GenerationMessageMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.UserConsentMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.mapper.UserMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class DataAccessIntegrationIT {

    @Container
    static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.4")
            .withDatabaseName("aivista")
            .withUsername("aivista")
            .withPassword("aivista");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> MYSQL.getJdbcUrl()
                + "&connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true");
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("app.auth.jwt.secret", () -> "test-only-jwt-secret-with-32-bytes-minimum");
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private AuthSessionMapper authSessionMapper;

    @Autowired
    private GenerationSessionMapper generationSessionMapper;

    @Autowired
    private GenerationMessageMapper generationMessageMapper;

    @Autowired
    private GenerationTaskMapper generationTaskMapper;

    @Autowired
    private GenerationImageMapper generationImageMapper;

    @Autowired
    private OutboxEventMapper outboxEventMapper;

    @Autowired
    private UserGenerationDailyUsageMapper userGenerationDailyUsageMapper;

    @Autowired
    private UserConsentMapper userConsentMapper;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.update("DELETE FROM outbox_events");
        jdbcTemplate.update("DELETE FROM auth_sessions");
        jdbcTemplate.update("DELETE FROM users");
    }

    @Test
    void flywayCreatesExpectedTables() {
        Integer tableCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name IN (
                    'users', 'auth_sessions', 'generation_sessions', 'generation_messages',
                    'generation_tasks', 'generation_images', 'outbox_events',
                    'user_generation_daily_usage', 'user_consents'
                  )
                """, Integer.class);

        assertThat(tableCount).isEqualTo(9);
    }

    @Test
    void generationMappersAreRegistered() {
        assertThat(generationSessionMapper).isNotNull();
        assertThat(generationMessageMapper).isNotNull();
        assertThat(generationTaskMapper).isNotNull();
        assertThat(generationImageMapper).isNotNull();
        assertThat(outboxEventMapper).isNotNull();
        assertThat(userGenerationDailyUsageMapper).isNotNull();
        assertThat(userConsentMapper).isNotNull();
    }

    @Test
    void userMapperPersistsAndUpdatesProfile() {
        User user = new User();
        user.setLoginName("Alice");
        user.setPasswordHash("argon2-hash");
        user.setNickname("Alice");

        assertThat(userMapper.insertSelective(user)).isEqualTo(1);
        assertThat(user.getId()).isNotNull();

        User stored = userMapper.selectByLoginName("alice");
        assertThat(stored).isNotNull();
        assertThat(stored.getLoginName()).isEqualTo("Alice");
        assertThat(stored.getCreatedAt()).isNotNull();

        assertThat(userMapper.updateProfile(user.getId(), "New Alice", null, "hello")).isEqualTo(1);
        User updated = userMapper.selectOneById(user.getId());
        assertThat(updated.getNickname()).isEqualTo("New Alice");
        assertThat(updated.getAvatarUrl()).isNull();
        assertThat(updated.getBio()).isEqualTo("hello");
    }

    @Test
    void authSessionMapperRotatesTokenAtomically() {
        User user = createUser("session_user");
        byte[] oldHash = sha256("old-token");
        byte[] newHash = sha256("new-token");

        AuthSession session = new AuthSession();
        session.setUserId(user.getId());
        session.setClientType("WEB");
        session.setRefreshTokenHash(oldHash);
        session.setExpiresAt(Instant.now().plusSeconds(3600));

        assertThat(authSessionMapper.insertSelective(session)).isEqualTo(1);
        assertThat(authSessionMapper.selectByRefreshTokenHash(oldHash)).isNotNull();

        Instant now = Instant.now();
        assertThat(authSessionMapper.rotateRefreshToken(session.getId(), oldHash, newHash, now)).isEqualTo(1);
        assertThat(authSessionMapper.rotateRefreshToken(session.getId(), oldHash, sha256("third-token"), now))
                .isZero();
        assertThat(authSessionMapper.selectByRefreshTokenHash(oldHash)).isNull();
        assertThat(authSessionMapper.selectByRefreshTokenHash(newHash)).isNotNull();
    }

    @Test
    void expiredSessionCannotRotateAndCanBeDeletedInBatches() {
        User user = createUser("expired_user");
        byte[] hash = sha256("expired-token");

        AuthSession session = new AuthSession();
        session.setUserId(user.getId());
        session.setClientType("WEB");
        session.setRefreshTokenHash(hash);
        session.setExpiresAt(Instant.now().minusSeconds(8 * 24 * 3600));
        assertThat(authSessionMapper.insertSelective(session)).isEqualTo(1);

        assertThat(authSessionMapper.rotateRefreshToken(
                session.getId(), hash, sha256("replacement"), Instant.now())).isZero();
        assertThat(authSessionMapper.deleteExpiredBatch(Instant.now().minusSeconds(7 * 24 * 3600), 100))
                .isEqualTo(1);
    }

    @Test
    void outboxMapperUpdatesClaimedEventsInBatches() {
        Instant now = Instant.parse("2026-08-15T12:00:00Z");
        OutboxEvent publishedOne = createOutboxEvent(42, 0, now);
        OutboxEvent publishedTwo = createOutboxEvent(43, 0, now);

        assertThat(outboxEventMapper.markPublishedBatch(
                java.util.List.of(publishedOne.getId(), publishedTwo.getId()), now)).isEqualTo(2);
        assertThat(outboxEventMapper.selectOneById(publishedOne.getId()).getStatus()).isEqualTo("PUBLISHED");
        assertThat(outboxEventMapper.selectOneById(publishedTwo.getId()).getPublishedAt()).isEqualTo(now);

        OutboxEvent retryOne = createOutboxEvent(44, 0, now);
        OutboxEvent retryTwo = createOutboxEvent(45, 2, now);
        retryOne.setRetryCount(1);
        retryOne.setAvailableAt(now.plusSeconds(5));
        retryTwo.setRetryCount(3);
        retryTwo.setAvailableAt(now.plusSeconds(120));

        assertThat(outboxEventMapper.rescheduleBatch(
                java.util.List.of(retryOne, retryTwo), "temporary")).isEqualTo(2);
        OutboxEvent storedRetryOne = outboxEventMapper.selectOneById(retryOne.getId());
        OutboxEvent storedRetryTwo = outboxEventMapper.selectOneById(retryTwo.getId());
        assertThat(storedRetryOne.getStatus()).isEqualTo("PENDING");
        assertThat(storedRetryOne.getRetryCount()).isEqualTo(1);
        assertThat(storedRetryOne.getAvailableAt()).isEqualTo(now.plusSeconds(5));
        assertThat(storedRetryTwo.getRetryCount()).isEqualTo(3);
        assertThat(storedRetryTwo.getAvailableAt()).isEqualTo(now.plusSeconds(120));

        OutboxEvent failedOne = createOutboxEvent(46, 0, now);
        OutboxEvent failedTwo = createOutboxEvent(47, 0, now);
        assertThat(outboxEventMapper.markFailedBatch(
                java.util.List.of(failedOne.getId(), failedTwo.getId()), "permanent")).isEqualTo(2);
        assertThat(outboxEventMapper.selectOneById(failedOne.getId()).getStatus()).isEqualTo("FAILED");
        assertThat(outboxEventMapper.selectOneById(failedTwo.getId()).getLastError()).isEqualTo("permanent");
    }

    private User createUser(String loginName) {
        User user = new User();
        user.setLoginName(loginName);
        user.setPasswordHash("argon2-hash");
        user.setNickname(loginName);
        userMapper.insertSelective(user);
        return user;
    }

    private OutboxEvent createOutboxEvent(long imageId, int retryCount, Instant now) {
        OutboxEvent event = new OutboxEvent();
        event.setEventType("PUBLICATION_SEARCH_INDEX_SYNC");
        event.setAggregateType("GENERATION_IMAGE");
        event.setAggregateId(imageId);
        event.setAggregateVersion(1L);
        event.setStatus("PROCESSING");
        event.setRetryCount(retryCount);
        event.setAvailableAt(now);
        event.setLockedAt(now);
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        outboxEventMapper.insertSelective(event);
        return event;
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }
}
