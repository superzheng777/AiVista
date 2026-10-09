package com.superz.aivista.common.transaction;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

/** Unit tests execute callbacks; rollback and locking are verified by the MySQL integration suite. */
public final class TestTransactions {
    private TestTransactions() {}
    public static RetryingTransaction immediate() {
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        return new RetryingTransaction(manager);
    }
}
