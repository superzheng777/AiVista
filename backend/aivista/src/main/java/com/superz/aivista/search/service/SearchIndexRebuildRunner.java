package com.superz.aivista.search.service;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.meilisearch.rebuild-on-startup", havingValue = "true")
public class SearchIndexRebuildRunner implements ApplicationRunner {
    private final SearchIndexRebuildService service;

    public SearchIndexRebuildRunner(SearchIndexRebuildService service) {
        this.service = service;
    }

    @Override
    public void run(ApplicationArguments args) {
        service.rebuild();
    }
}
