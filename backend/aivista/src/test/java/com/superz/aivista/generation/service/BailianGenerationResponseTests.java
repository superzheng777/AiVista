package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class BailianGenerationResponseTests {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void readsQwenImage20UsageFields() throws Exception {
        BailianGenerationResponse response = readUsage("""
                {"image_count":2,"width":2048,"height":2048}
                """);

        assertThat(response.usage()).isEqualTo(new BailianGenerationResponse.Usage(2, 2048, 2048));
    }

    @Test
    void readsQwenImage30UsageFields() throws Exception {
        BailianGenerationResponse response = readUsage("""
                {"output_image_count":2,"output_width":2048,"output_height":2048}
                """);

        assertThat(response.usage()).isEqualTo(new BailianGenerationResponse.Usage(2, 2048, 2048));
    }

    private BailianGenerationResponse readUsage(String usage) throws Exception {
        return objectMapper.readValue("{\"usage\":" + usage + "}", BailianGenerationResponse.class);
    }
}
