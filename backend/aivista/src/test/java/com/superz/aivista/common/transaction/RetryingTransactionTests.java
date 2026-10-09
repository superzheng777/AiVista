package com.superz.aivista.common.transaction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class RetryingTransactionTests {
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);

    @Test
    void retriesAtMostThreeWholeTransactionsAndRollsBackEveryFailure() {
        when(manager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        var runner = new RetryingTransaction(manager);
        AtomicInteger calls = new AtomicInteger();
        var deadlock = new PessimisticLockingFailureException("deadlock", new SQLException("deadlock", "40001", 1213));
        assertThatThrownBy(() -> runner.run(() -> { calls.incrementAndGet(); throw deadlock; })).isSameAs(deadlock);
        assertThat(calls.get()).isEqualTo(3);
        verify(manager, times(3)).rollback(any());
        verify(manager, never()).commit(any());
    }

    @Test
    void unrelatedDatabaseErrorsAreNotRetried() {
        when(manager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        var error = new DataIntegrityViolationException("invalid foreign key");
        assertThatThrownBy(() -> new RetryingTransaction(manager).run(() -> { throw error; })).isSameAs(error);
        verify(manager).rollback(any());
    }

    @Test
    void joinedTransactionMustBeRetriedByItsOuterOwner() {
        when(manager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        var error = new PessimisticLockingFailureException("deadlock", new SQLException("deadlock", "40001", 1213));
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            assertThatThrownBy(() -> new RetryingTransaction(manager).run(() -> { throw error; })).isSameAs(error);
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
        verify(manager).rollback(any());
    }
}
