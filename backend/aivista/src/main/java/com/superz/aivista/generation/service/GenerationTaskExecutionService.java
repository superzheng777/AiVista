package com.superz.aivista.generation.service;

import com.superz.aivista.generation.entity.GenerationImage;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.mapper.GenerationImageMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import com.superz.aivista.generation.message.TaskExecuteMessage;
import com.superz.aivista.generation.model.GenerationFailureCode;
import com.superz.aivista.generation.model.GenerationTaskStatus;
import com.superz.aivista.generation.model.OutboxEventType;
import com.superz.aivista.generation.model.OutboxStatus;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 执行单条 MQ 消息；所有数据库事务都短暂结束于网络调用前后。 */
@Service
public class GenerationTaskExecutionService {
    private static final ZoneId QUOTA_ZONE = ZoneId.of("Asia/Shanghai");

    private final GenerationTaskMapper taskMapper;
    private final GenerationImageMapper imageMapper;
    private final OutboxEventMapper outboxEventMapper;
    private final UserGenerationDailyUsageMapper dailyUsageMapper;
    private final GenerationBailianClient bailianClient;
    private final GenerationProviderCallGate providerCallGate;
    private final GenerationImageTransferService imageTransferService;
    private final TransactionTemplate transactions;
    private final Clock clock;

    /** 注入状态持久化、外部执行器与事务模板；网络调用始终不持有数据库事务。 */
    public GenerationTaskExecutionService(GenerationTaskMapper taskMapper, GenerationImageMapper imageMapper,
            OutboxEventMapper outboxEventMapper, UserGenerationDailyUsageMapper dailyUsageMapper,
            GenerationBailianClient bailianClient, GenerationProviderCallGate providerCallGate,
            GenerationImageTransferService imageTransferService, PlatformTransactionManager transactionManager,
            Clock clock) {
        this.taskMapper = taskMapper;
        this.imageMapper = imageMapper;
        this.outboxEventMapper = outboxEventMapper;
        this.dailyUsageMapper = dailyUsageMapper;
        this.bailianClient = bailianClient;
        this.providerCallGate = providerCallGate;
        this.imageTransferService = imageTransferService;
        this.transactions = new TransactionTemplate(transactionManager);
        this.clock = clock;
    }

    /** 返回 true 时消息可安全 ACK；数据库基础设施异常会抛出，交给 RabbitMQ 重投。 */
    public boolean execute(TaskExecuteMessage message) {
        ExecutionPlan plan = inTransaction(() -> prepare(message, clock.instant()));
        if (plan == null || plan.kind() == PlanKind.ACK) {
            return true;
        }
        GenerationBailianClient.ProviderResult result;
        try {
            if (plan.kind() == PlanKind.CALL_PROVIDER) {
                try (GenerationProviderCallGate.Permit ignored = providerCallGate.acquire()) {
                    boolean callStarted = inTransaction(() -> taskMapper.markProviderCallStarted(
                            plan.task().getId(), clock.instant()) == 1);
                    if (!callStarted) {
                        return true;
                    }
                    result = bailianClient.generate(plan.task());
                }
                GenerationBailianClient.ProviderResult saved = result;
                boolean snapshotSaved = inTransaction(() -> taskMapper.saveProviderResult(
                        plan.task().getId(), saved.requestId(), saved.snapshot(), clock.instant()) == 1);
                if (!snapshotSaved) {
                    return true;
                }
            } else {
                result = bailianClient.restore(plan.task().getProviderResultSnapshot());
            }
            List<GenerationImageTransferService.TransferredImage> images = imageTransferService.transfer(plan.task(), result.imageUrls());
            GenerationBailianClient.ProviderResult completedResult = result;
            boolean completed = inTransaction(() -> complete(plan.task(), images, completedResult, clock.instant()));
            if (!completed) {
                imageTransferService.deleteTransferred(images);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        } catch (BailianProviderException exception) {
            if (isRetryable(exception) && inTransaction(() -> retry(plan.task().getId(), clock.instant()))) {
                return true;
            }
            inTransaction(() -> {
                fail(plan.task(), failureCodeOf(exception), exception.requestId(), clock.instant());
                return null;
            });
        } catch (BailianConnectionException exception) {
            if (inTransaction(() -> retry(plan.task().getId(), clock.instant()))) {
                return true;
            }
            inTransaction(() -> {
                fail(plan.task(), GenerationFailureCode.PROVIDER_CONNECTION_FAILED, null, clock.instant());
                return null;
            });
        } catch (Exception exception) {
            inTransaction(() -> {
                fail(plan.task(), GenerationFailureCode.PROVIDER_CALL_OUTCOME_UNKNOWN, null, clock.instant());
                return null;
            });
        }
        return true;
    }

    /** 在行锁内判断消息是否过期，并决定调用百炼、恢复转存或直接确认。 */
    private ExecutionPlan prepare(TaskExecuteMessage message, Instant now) {
        GenerationTask task = taskMapper.selectByIdForUpdate(message.taskId());
        if (task == null || isTerminal(task.getStatus())) {
            return new ExecutionPlan(PlanKind.ACK, task);
        }
        if ("QUEUED".equals(task.getStatus())) {
            if (task.getTaskVersion() != message.taskVersion()
                    || taskMapper.claimQueuedForExecution(task.getId(), task.getTaskVersion(), now) != 1) {
                return new ExecutionPlan(PlanKind.ACK, task);
            }
            task.setStatus(GenerationTaskStatus.RUNNING.name());
            return new ExecutionPlan(PlanKind.CALL_PROVIDER, task);
        }
        if (!"RUNNING".equals(task.getStatus())) {
            return new ExecutionPlan(PlanKind.ACK, task);
        }
        if (task.getProviderResultSnapshot() != null) {
            return new ExecutionPlan(PlanKind.TRANSFER_SNAPSHOT, task);
        }
        if (task.getProviderCallStartedAt() != null) {
            fail(task, GenerationFailureCode.PROVIDER_CALL_OUTCOME_UNKNOWN, null, now);
            return new ExecutionPlan(PlanKind.ACK, task);
        }
        return new ExecutionPlan(PlanKind.CALL_PROVIDER, task);
    }

    /** 在同一事务中保存成功图片、写入终态并创建状态变化 Outbox 事件。 */
    private boolean complete(GenerationTask task, List<GenerationImageTransferService.TransferredImage> images,
            GenerationBailianClient.ProviderResult result, Instant now) {
        GenerationTask current = taskMapper.selectByIdForUpdate(task.getId());
        if (current == null || !"RUNNING".equals(current.getStatus())) {
            return false;
        }
        for (GenerationImageTransferService.TransferredImage image : images) {
            if ((result.declaredWidth() != null && image.width() != result.declaredWidth())
                    || (result.declaredHeight() != null && image.height() != result.declaredHeight())
                    || image.width() != current.getWidth() || image.height() != current.getHeight()) {
                throw new IllegalStateException("Transferred image dimensions do not match the generation response");
            }
        }
        for (GenerationImageTransferService.TransferredImage image : images) {
            GenerationImage entity = new GenerationImage();
            entity.setTaskId(current.getId());
            entity.setUserId(current.getUserId());
            entity.setObjectKey(image.objectKey());
            entity.setContentType("image/png");
            entity.setFileSize(image.fileSize());
            entity.setWidth(image.width());
            entity.setHeight(image.height());
            entity.setSourceIndex(image.sourceIndex());
            entity.setCreatedAt(now);
            imageMapper.insertSelective(entity);
        }
        String status = images.size() == result.imageUrls().size() ? GenerationTaskStatus.SUCCEEDED.name()
                : images.isEmpty() ? GenerationTaskStatus.FAILED.name() : GenerationTaskStatus.PARTIALLY_SUCCEEDED.name();
        String failureCode = GenerationTaskStatus.SUCCEEDED.name().equals(status) ? null
                : images.isEmpty() ? GenerationFailureCode.IMAGE_TRANSFER_FAILED.name()
                : GenerationFailureCode.IMAGE_TRANSFER_PARTIAL_FAILURE.name();
        if (taskMapper.completeRunning(current.getId(), status, images.size(), failureCode, now) != 1) {
            throw new IllegalStateException("Cannot complete generation task " + current.getId());
        }
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.TASK_STATUS_CHANGED.name());
        event.setTaskId(current.getId());
        event.setTaskVersion(current.getTaskVersion() + 1);
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now);
        event.setCreatedAt(now);
        outboxEventMapper.insertSelective(event);
        return true;
    }

    /** 按稳定失败码终止仍在运行的任务；仅结果未知等平台失败返还一次额度。 */
    private void fail(GenerationTask task, GenerationFailureCode failureCode, String providerRequestId, Instant now) {
        GenerationTask current = taskMapper.selectByIdForUpdate(task.getId());
        if (current == null || !"RUNNING".equals(current.getStatus())) {
            return;
        }
        if (providerRequestId != null && !providerRequestId.isBlank()) {
            taskMapper.saveProviderRequestId(current.getId(), providerRequestId, now);
        }
        boolean refund = failureCode == GenerationFailureCode.PROVIDER_CALL_OUTCOME_UNKNOWN
                || failureCode == GenerationFailureCode.PROVIDER_CONNECTION_FAILED
                || failureCode == GenerationFailureCode.PROVIDER_RATE_LIMITED
                || failureCode == GenerationFailureCode.PROVIDER_SERVICE_UNAVAILABLE;
        if (refund && current.getQuotaRefundedAt() == null && dailyUsageMapper.refund(current.getUserId(),
                LocalDate.ofInstant(current.getCreatedAt(), QUOTA_ZONE), current.getRequestedImageCount(), now) != 1) {
            throw new IllegalStateException("Generation quota refund record is missing for task " + current.getId());
        }
        taskMapper.failRunning(current.getId(), failureCode.name(), refund ? now : null, now);
    }

    /** 按官方错误码和 HTTP 状态映射为任务层稳定失败码，不暴露原始服务商文案。 */
    private static GenerationFailureCode failureCodeOf(BailianProviderException exception) {
        String code = exception.providerCode();
        if ("DataInspectionFailed".equals(code)) {
            return GenerationFailureCode.PROVIDER_CONTENT_REJECTED;
        }
        if ("Throttling".equals(code) || "Throttling.RateQuota".equals(code)
                || "Throttling.BurstRate".equals(code)) {
            return GenerationFailureCode.PROVIDER_RATE_LIMITED;
        }
        if ("Throttling.AllocationQuota".equals(code) || "CommodityNotPurchased".equals(code)) {
            return GenerationFailureCode.PROVIDER_QUOTA_UNAVAILABLE;
        }
        if (exception.httpStatus() >= 500) {
            return GenerationFailureCode.PROVIDER_SERVICE_UNAVAILABLE;
        }
        if (exception.httpStatus() == 400 || exception.httpStatus() == 401
                || exception.httpStatus() == 403 || exception.httpStatus() == 404) {
            return GenerationFailureCode.PROVIDER_CONFIGURATION_ERROR;
        }
        return GenerationFailureCode.PROVIDER_CALL_OUTCOME_UNKNOWN;
    }

    private boolean retry(long taskId, Instant now) {
        GenerationTask current = taskMapper.selectByIdForUpdate(taskId);
        if (current == null || !"RUNNING".equals(current.getStatus()) || current.getAttemptCount() >= 3
                || taskMapper.requeueRunningForRetry(current.getId(), current.getTaskVersion(), now) != 1) {
            return false;
        }
        OutboxEvent event = new OutboxEvent();
        event.setEventType(OutboxEventType.TASK_EXECUTE.name());
        event.setTaskId(current.getId());
        event.setTaskVersion(current.getTaskVersion() + 1);
        event.setStatus(OutboxStatus.PENDING.name());
        event.setRetryCount(0);
        event.setAvailableAt(now.plusSeconds(1L << current.getAttemptCount())
                .plusMillis(ThreadLocalRandom.current().nextLong(1001)));
        event.setCreatedAt(now);
        outboxEventMapper.insertSelective(event);
        return true;
    }

    private static boolean isRetryable(BailianProviderException exception) {
        String code = exception.providerCode();
        return exception.httpStatus() >= 500 || "Throttling".equals(code)
                || "Throttling.RateQuota".equals(code) || "Throttling.BurstRate".equals(code);
    }

    /** 执行一个短数据库事务，确保远程调用不占用数据库连接和行锁。 */
    private <T> T inTransaction(TransactionCallback<T> callback) {
        return transactions.execute(status -> callback.run());
    }

    /** 判断任务是否已经进入不可再执行的终态。 */
    private static boolean isTerminal(String status) {
        return "SUCCEEDED".equals(status) || "PARTIALLY_SUCCEEDED".equals(status)
                || "FAILED".equals(status) || "CANCELLED".equals(status);
    }

    private enum PlanKind { ACK, CALL_PROVIDER, TRANSFER_SNAPSHOT }

    private record ExecutionPlan(PlanKind kind, GenerationTask task) { }

    @FunctionalInterface
    private interface TransactionCallback<T> { T run(); }
}
