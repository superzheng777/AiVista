package com.superz.aivista.common.transaction;

import java.sql.SQLException;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Retries a complete database transaction only after MySQL has rolled back a deadlock victim. */
@Component
public class RetryingTransaction {
    private static final int MAX_ATTEMPTS = 3;
    private final TransactionTemplate transaction;

    public RetryingTransaction(PlatformTransactionManager transactionManager) {
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public void run(Runnable work) {
        execute(() -> { work.run(); return null; });
    }

    public <T> T execute(Supplier<T> work) {
        // A joined transaction must be retried by its outer owner, never partially replayed.
        boolean joined = TransactionSynchronizationManager.isActualTransactionActive();
        for (int attempt = 1; ; attempt++) {
            try {
                return transaction.execute(status -> work.get());
            } catch (RuntimeException exception) {
                if (joined || attempt == MAX_ATTEMPTS || !isDeadlock(exception)) throw exception;
                try {
                    Thread.sleep(ThreadLocalRandom.current().nextLong(10L, 31L) * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw exception;
                }
            }
        }
    }

    private static boolean isDeadlock(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && sql.getErrorCode() == 1213
                    && "40001".equals(sql.getSQLState())) return true;
        }
        return false;
    }
}
