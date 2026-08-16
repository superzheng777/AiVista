package com.superz.aivista.search.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withForbiddenRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withResourceNotFound;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MeilisearchAdminClientTests {
    @Test
    void treatsMissingIndexAsRecoverableState() {
        Fixture fixture = fixture();
        fixture.adminServer.expect(requestTo("http://meili.test/indexes/public_images"))
                .andRespond(withResourceNotFound().body("""
                        {"code":"index_not_found","type":"invalid_request"}
                        """).contentType(MediaType.APPLICATION_JSON));

        assertThat(fixture.client.indexExists("public_images")).isFalse();
        fixture.adminServer.verify();
    }

    @Test
    void classifiesAuthorizationFailureAsRequiringAction() {
        Fixture fixture = fixture();
        fixture.adminServer.expect(requestTo("http://meili.test/indexes/public_images"))
                .andRespond(withForbiddenRequest().body("""
                        {"code":"invalid_api_key","type":"auth"}
                        """).contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> fixture.client.indexExists("public_images"))
                .isInstanceOfSatisfying(MeilisearchAdminException.class,
                        exception -> assertThat(exception.kind()).isEqualTo(MeilisearchAdminException.Kind.REQUIRES_ACTION));
    }

    @Test
    void submitsDocumentIdsToBatchDeleteEndpoint() {
        Fixture fixture = fixture();
        fixture.adminServer.expect(requestTo("http://meili.test/indexes/public_images/documents/delete-batch"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("[42,99]"))
                .andRespond(withSuccess("""
                        {"taskUid":21,"indexUid":"public_images","status":"enqueued","type":"documentDeletion"}
                        """, MediaType.APPLICATION_JSON));

        assertThat(fixture.client.deleteDocuments("public_images", List.of(42L, 99L))).isEqualTo(21L);
        fixture.adminServer.verify();
    }

    @Test
    void readsTaskStatusThroughDedicatedTaskClient() {
        Fixture fixture = fixture();
        fixture.taskServer.expect(requestTo("http://meili.test/tasks/21"))
                .andExpect(header("Authorization", "Bearer task"))
                .andRespond(withSuccess("""
                        {"uid":21,"indexUid":null,"status":"succeeded","type":"indexSwap"}
                        """, MediaType.APPLICATION_JSON));

        fixture.client.waitForTask(21L);

        fixture.taskServer.verify();
    }

    private static Fixture fixture() {
        RestClient.Builder adminBuilder = RestClient.builder().baseUrl("http://meili.test");
        RestClient.Builder taskBuilder = RestClient.builder().baseUrl("http://meili.test")
                .defaultHeader("Authorization", "Bearer task");
        MockRestServiceServer adminServer = MockRestServiceServer.bindTo(adminBuilder).build();
        MockRestServiceServer taskServer = MockRestServiceServer.bindTo(taskBuilder).build();
        return new Fixture(new MeilisearchAdminClient(adminBuilder.build(), taskBuilder.build(), properties(),
                new ObjectMapper()), adminServer, taskServer);
    }

    private static MeilisearchProperties properties() {
        return new MeilisearchProperties(true, "http://meili.test", "search", "admin", "task", "public_images",
                Duration.ofSeconds(1), Duration.ofSeconds(2), Duration.ofSeconds(2), Duration.ofSeconds(5),
                Duration.ofSeconds(1), 100, false, false);
    }

    private record Fixture(MeilisearchAdminClient client, MockRestServiceServer adminServer,
                           MockRestServiceServer taskServer) { }
}
