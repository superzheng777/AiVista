package com.superz.aivista.search.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.superz.aivista.search.config.MeilisearchProperties;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MeilisearchSearchClientTests {
    @Test
    void postsFixedSearchContractAndReadsOnlyImageIds() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://meili.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MeilisearchSearchClient client = new MeilisearchSearchClient(builder.build(), properties());
        server.expect(requestTo("http://meili.test/indexes/public_images/search"))
                .andExpect(content().json("""
                        {"q":"ai","offset":0,"limit":20,"matchingStrategy":"frequency","attributesToRetrieve":["imageId"]}
                        """))
                .andRespond(withSuccess("{\"hits\":[{\"imageId\":42}],\"estimatedTotalHits\":1}", MediaType.APPLICATION_JSON));

        assertThat(client.search("ai", 0, 20)).containsExactly(42L);
        server.verify();
    }

    private static MeilisearchProperties properties() {
        return new MeilisearchProperties(true, "http://meili.test", "search", "admin", "task", "public_images",
                Duration.ofSeconds(1), Duration.ofSeconds(2), Duration.ofSeconds(2), Duration.ofSeconds(5),
                Duration.ofSeconds(30), 100, false, false);
    }
}
