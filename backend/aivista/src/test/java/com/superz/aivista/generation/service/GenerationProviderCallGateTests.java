package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.superz.aivista.generation.config.GenerationBailianProperties;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

class GenerationProviderCallGateTests {

    @Test
    void spacesCallStartsAccordingToConfiguredRate() throws Exception {
        GenerationProviderCallGate gate = new GenerationProviderCallGate(properties(2, 2));
        long startedAt = System.nanoTime();

        for (int index = 0; index < 3; index++) {
            try (GenerationProviderCallGate.Permit ignored = gate.acquire()) {
                // 调用资格仅在此作用域内持有。
            }
        }

        assertThat(System.nanoTime() - startedAt).isGreaterThanOrEqualTo(TimeUnit.MILLISECONDS.toNanos(900));
    }

    @Test
    void blocksSecondCallUntilConcurrencyPermitIsReleased() throws Exception {
        GenerationProviderCallGate gate = new GenerationProviderCallGate(properties(1, 1_000_000));
        GenerationProviderCallGate.Permit first = gate.acquire();
        CountDownLatch attempting = new CountDownLatch(1);
        CountDownLatch acquired = new CountDownLatch(1);

        Thread second = Thread.ofVirtual().start(() -> {
            attempting.countDown();
            try (GenerationProviderCallGate.Permit ignored = gate.acquire()) {
                acquired.countDown();
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        });

        assertThat(attempting.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(acquired.await(100, TimeUnit.MILLISECONDS)).isFalse();
        first.close();
        assertThat(acquired.await(1, TimeUnit.SECONDS)).isTrue();
        second.join();
    }

    @Test
    void isCreatedBySpringThroughItsSingleConstructor() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(GenerationBailianProperties.class, () -> properties(30, 2));
            context.registerBean(GenerationProviderCallGate.class);
            context.refresh();

            assertThat(context.getBean(GenerationProviderCallGate.class)).isNotNull();
        }
    }

    private static GenerationBailianProperties properties(int maxConcurrentCalls, int rateLimitPerSecond) {
        return new GenerationBailianProperties("https://bailian.example", "test-api-key",
                Duration.ofSeconds(5), Duration.ofMinutes(5), maxConcurrentCalls, rateLimitPerSecond, 3);
    }
}
