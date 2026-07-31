package com.superz.aivista.generation.service;

import com.superz.aivista.generation.config.GenerationBailianProperties;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;

/**
 * 单实例百炼调用门控，同时限制在途调用数和调用启动速率。
 * 多实例部署前必须替换为跨实例共享限流能力。
 */
@Service
public class GenerationProviderCallGate {
    private static final long NANOS_PER_SECOND = TimeUnit.SECONDS.toNanos(1);

    private final Semaphore concurrencyPermits;
    private final long startIntervalNanos;
    private long nextStartNanos;

    /** 使用百炼配置创建单实例调用门控。 */
    public GenerationProviderCallGate(GenerationBailianProperties properties) {
        this.concurrencyPermits = new Semaphore(properties.maxConcurrentCalls(), true);
        this.startIntervalNanos = NANOS_PER_SECOND / properties.rateLimitPerSecond();
    }

    /**
     * 等待并取得一次调用资格。关闭返回的许可时释放并发槽位。
     * 调用方必须在取得许可后再次确认任务仍允许调用服务商。
     */
    public Permit acquire() throws InterruptedException {
        concurrencyPermits.acquire();
        boolean acquired = false;
        try {
            awaitStartSlot();
            acquired = true;
            return concurrencyPermits::release;
        } finally {
            if (!acquired) {
                concurrencyPermits.release();
            }
        }
    }

    /** 串行分配调用启动时间，避免同一秒内突发超过配置速率。 */
    private synchronized void awaitStartSlot() throws InterruptedException {
        long now = System.nanoTime();
        long waitNanos = nextStartNanos - now;
        if (waitNanos > 0) {
            TimeUnit.NANOSECONDS.sleep(waitNanos);
            now = System.nanoTime();
        }
        nextStartNanos = Math.max(now, nextStartNanos) + startIntervalNanos;
    }

    @FunctionalInterface
    public interface Permit extends AutoCloseable {
        @Override
        void close();
    }
}
