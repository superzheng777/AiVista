package com.superz.aivista.data;

import com.superz.aivista.config.DataAccessConfig;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.yaml.snakeyaml.Yaml;

/** Uses application-local.yaml credentials, but creates and drops only a random aivista_it_* database. */
@SpringBootTest(classes = LocalMysqlIntegrationTest.Config.class, webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = "knife4j.enable=false")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
abstract class LocalMysqlIntegrationTest {
    private static String adminUrl;
    private static String username;
    private static String password;
    private static String database;

    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration
    @Import(DataAccessConfig.class)
    static class Config {}

    @Autowired protected JdbcTemplate jdbcTemplate;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) throws Exception {
        Path config = Path.of("src/main/resources/application-local.yaml");
        if (!Files.exists(config)) throw new IllegalStateException("MySQL integration tests require application-local.yaml");
        Map<?, ?> yaml = new Yaml().load(Files.readString(config));
        Map<?, ?> datasource = (Map<?, ?>) ((Map<?, ?>) yaml.get("spring")).get("datasource");
        String url = resolve(datasource.get("url"));
        if (!url.matches("jdbc:mysql://(localhost|127\\.0\\.0\\.1)(:[0-9]+)?/.*")) {
            throw new IllegalStateException("Integration tests require local MySQL");
        }
        username = resolve(datasource.get("username"));
        password = resolve(datasource.get("password"));
        int slash = url.indexOf('/', "jdbc:mysql://".length());
        String query = url.contains("?") ? url.substring(url.indexOf('?')) : "";
        adminUrl = url.substring(0, slash + 1) + query;
        database = "aivista_it_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(adminUrl, username, password);
                var statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE `" + database + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        }
        String testUrl = url.substring(0, slash + 1) + database + query;
        registry.add("spring.datasource.url", () -> testUrl);
        registry.add("spring.datasource.username", () -> username);
        registry.add("spring.datasource.password", () -> password);
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> 16);
    }

    @BeforeEach
    void clearTestRows() {
        jdbcTemplate.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement = connection.createStatement()) {
                var tables = jdbcTemplate.queryForList(
                        "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> 'flyway_schema_history'", String.class);
                statement.execute("SET FOREIGN_KEY_CHECKS=0");
                try {
                    for (String table : tables) statement.execute("TRUNCATE TABLE `" + table + "`");
                } finally {
                    statement.execute("SET FOREIGN_KEY_CHECKS=1");
                }
            }
            return null;
        });
    }

    private static String resolve(Object value) {
        return java.util.regex.Pattern.compile("\\$\\{([^:}]+)(?::([^}]*))?}")
                .matcher(String.valueOf(value)).replaceAll(match -> java.util.regex.Matcher.quoteReplacement(
                        System.getenv().getOrDefault(match.group(1), match.group(2) == null ? "" : match.group(2))));
    }

    @AfterAll
    static void dropTestDatabase() throws Exception {
        if (database == null || !database.matches("aivista_it_[a-f0-9]{32}")) return;
        try (var connection = DriverManager.getConnection(adminUrl, username, password);
                var statement = connection.createStatement()) {
            statement.execute("DROP DATABASE IF EXISTS `" + database + "`");
        }
    }
}
