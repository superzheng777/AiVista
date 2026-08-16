package com.superz.aivista.search.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withForbiddenRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withResourceNotFound;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MeilisearchAdminClientTests {
    @Test
    void treatsMissingIndexAsRecoverableState() {
        Fixture fixture = fixture();
        fixture.server.expect(requestTo("http://meili.test/indexes/public_images"))
                .andRespond(withResourceNotFound().body("""
                        {"code":"index_not_found","type":"invalid_request"}
                        """).contentType(MediaType.APPLICATION_JSON));

        assertThat(fixture.client.indexExists("public_images")).isFalse();
        fixture.server.verify();
    }

    @Test
    void classifiesAuthorizationFailureAsRequiringAction() {
        Fixture fixture = fixture();
        fixture.server.expect(requestTo("http://meili.test/indexes/public_images"))
                .andRespond(withForbiddenRequest().body("""
                        {"code":"invalid_api_key","type":"auth"}
                        """).contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> fixture.client.indexExists("public_images"))
                .isInstanceOfSatisfying(MeilisearchAdminException.class,
                        exception -> assertThat(exception.kind()).isEqualTo(MeilisearchAdminException.Kind.REQUIRES_ACTION));
    }

    private static Fixture fixture() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://meili.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        return new Fixture(new MeilisearchAdminClient(builder.build(), properties(), new ObjectMapper()), server);
    }

    private static MeilisearchProperties properties() {
        return new MeilisearchProperties(true, "http://meili.test", "search", "admin", "public_images",
                Duration.ofSeconds(1), Duration.ofSeconds(2), Duration.ofSeconds(2), Duration.ofSeconds(5),
                Duration.ofSeconds(1), 100, false, false);
    }

    private record Fixture(MeilisearchAdminClient client, MockRestServiceServer server) { }
}
