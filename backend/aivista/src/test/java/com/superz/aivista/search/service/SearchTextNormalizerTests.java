package com.superz.aivista.search.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SearchTextNormalizerTests {
    @Test
    void normalizesWidthWhitespaceCaseAccentsAndOperators() {
        assertThat(SearchTextNormalizer.normalizeSubmitted("  ＡＩ　 Café  ")).isEqualTo("AI Café");
        assertThat(SearchTextNormalizer.toSearchText("ＡＩ，Café - \"星空\" 🚀"))
                .isEqualTo("ai cafe 星空");
    }

    @Test
    void pureSymbolsBecomePlaceholderQuery() {
        assertThat(SearchTextNormalizer.toSearchText("？！🚀")) .isEmpty();
    }
}
