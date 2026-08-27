package com.superz.aivista.generation.service;

import com.superz.aivista.generation.entity.ImageAsset;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.mapper.ImageAssetMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.message.ImageTransferMessage;
import com.superz.aivista.generation.model.GenerationFailureCode;
import com.superz.aivista.generation.model.GenerationTaskStatus;
import com.superz.aivista.generation.model.GenerationImageObjectKeys;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 执行独立转存消息；网络传输前后均使用短事务，数据库快照是临时 URL 的唯一来源。 */
@Service
public class GenerationImageTransferExecutionService {
    private final GenerationTaskMapper taskMapper;
    private final ImageAssetMapper imageAssetMapper;
    private final OutboxEventMapper outboxEventMapper;
    private final GenerationBailianClient bailianClient;
    private final GenerationImageTransferService transferService;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public GenerationImageTransferExecutionService(GenerationTaskMapper taskMapper,
            ImageAssetMapper imageAssetMapper, OutboxEventMapper outboxEventMapper,
            GenerationBailianClient bailianClient, GenerationImageTransferService transferService,
            PlatformTransactionManager transactionManager, Clock clock) {
        this.taskMapper = taskMapper;
        this.imageAssetMapper = imageAssetMapper;
        this.outboxEventMapper = outboxEventMapper;
        this.bailianClient = bailianClient;
        this.transferService = transferService;
        this.transactions = new TransactionTemplate(transactionManager);
        this.clock = clock;
    }

    /** 返回 true 表示消息已安全收敛或已经过期，可以 ACK。 */
    public boolean execute(ImageTransferMessage message) {
        GenerationTask task = transactions.execute(status -> prepare(message, clock.instant()));
        if (task == null) {
            return true;
        }
        GenerationBailianClient.ProviderResult result = bailianClient.restore(task.getProviderResultSnapshot());
        List<GenerationImageTransferService.TransferredImage> images =
                transferService.transfer(task, result.imageUrls());
        CompletionResult completion = transactions.execute(status ->
                complete(task, message.taskVersion(), images, result, clock.instant()));
        if (completion == CompletionResult.CANCELLED) {
            transferService.deleteTransferred(images);
        }
        return true;
    }

    /** 条件领取对应版本的转存任务；已领取后的重投仍允许按同一版本恢复。 */
    private GenerationTask prepare(ImageTransferMessage message, Instant now) {
        GenerationTask task = taskMapper.selectByIdForUpdate(message.taskId());
        if (task == null || isTerminal(task.getStatus())
                || !GenerationTaskStatus.TRANSFERRING.name().equals(task.getStatus())
                || task.getTaskVersion() != message.taskVersion()) {
            return null;
        }
        if (task.getProviderResultSnapshot() == null || task.getProviderResultSnapshot().isBlank()) {
            throw new IllegalStateException("Transfer snapshot is missing for task " + task.getId());
        }
        if (task.getTransferStartedAt() == null
                && taskMapper.markTransferStarted(task.getId(), task.getTaskVersion(), now) != 1) {
            return null;
        }
        task.setTransferStartedAt(now);
        return task;
    }

    /** 保存成功图片并将对应版本的 TRANSFERRING 任务收敛为唯一终态。 */
    private CompletionResult complete(GenerationTask task, int taskVersion,
            List<GenerationImageTransferService.TransferredImage> images,
            GenerationBailianClient.ProviderResult result, Instant now) {
        GenerationTask current = taskMapper.selectByIdForUpdate(task.getId());
        if (current == null || !GenerationTaskStatus.TRANSFERRING.name().equals(current.getStatus())
                || current.getTaskVersion() != taskVersion) {
            return current != null && GenerationTaskStatus.CANCELLED.name().equals(current.getStatus())
                    ? CompletionResult.CANCELLED : CompletionResult.NO_LONGER_OWNER;
        }
        for (GenerationImageTransferService.TransferredImage image : images) {
            if ((result.declaredWidth() != null && image.width() != result.declaredWidth())
                    || (result.declaredHeight() != null && image.height() != result.declaredHeight())
                    || image.width() != current.getWidth() || image.height() != current.getHeight()) {
                throw new IllegalStateException("Transferred image dimensions do not match the generation response");
            }
            ImageAsset entity = new ImageAsset();
            entity.setUserId(current.getUserId());
            entity.setOrigin("GENERATED");
            entity.setLifecycle("PERSISTENT");
            entity.setOriginTaskId(current.getId());
            entity.setSourceIndex(image.sourceIndex());
            entity.setObjectKey(image.objectKey());
            entity.setOriginalObjectKey(GenerationImageObjectKeys.fromStoredValue(image.objectKey()).original());
            entity.setContentType("image/png");
            entity.setFileSize(image.fileSize());
            entity.setWidth(image.width());
            entity.setHeight(image.height());
            entity.setCreatedAt(now);
            imageAssetMapper.insertSelective(entity);
        }
        String finalStatus = images.size() == result.imageUrls().size()
                ? GenerationTaskStatus.SUCCEEDED.name()
                : images.isEmpty() ? GenerationTaskStatus.FAILED.name()
                : GenerationTaskStatus.PARTIALLY_SUCCEEDED.name();
        String failureCode = GenerationTaskStatus.SUCCEEDED.name().equals(finalStatus) ? null
                : images.isEmpty() ? GenerationFailureCode.IMAGE_TRANSFER_FAILED.name()
                : GenerationFailureCode.IMAGE_TRANSFER_PARTIAL_FAILURE.name();
        if (taskMapper.completeTransferring(current.getId(), taskVersion, finalStatus,
                images.size(), failureCode, now) != 1) {
            throw new IllegalStateException("Cannot complete generation transfer task " + current.getId());
        }
        outboxEventMapper.insertSelective(GenerationStatusOutboxEvent.create(
                current.getId(), taskVersion + 1, finalStatus,
                current.getAttemptCount() == null ? 0 : current.getAttemptCount(), now));
        return CompletionResult.COMPLETED;
    }

    private static boolean isTerminal(String status) {
        return GenerationTaskStatus.SUCCEEDED.name().equals(status)
                || GenerationTaskStatus.PARTIALLY_SUCCEEDED.name().equals(status)
                || GenerationTaskStatus.FAILED.name().equals(status)
                || GenerationTaskStatus.CANCELLED.name().equals(status);
    }

    /** A non-owner never deletes deterministic keys that a winning worker may now own. */
    private enum CompletionResult { COMPLETED, CANCELLED, NO_LONGER_OWNER }
}
