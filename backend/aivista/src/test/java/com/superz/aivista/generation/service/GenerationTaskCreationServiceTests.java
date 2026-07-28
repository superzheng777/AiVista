package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.generation.config.GenerationTaskProperties;
import com.superz.aivista.generation.dto.CreateGenerationTaskRequest;
import com.superz.aivista.generation.dto.GenerationConsentResponse;
import com.superz.aivista.generation.entity.GenerationMessage;
import com.superz.aivista.generation.entity.GenerationSession;
import com.superz.aivista.generation.entity.GenerationTask;
import com.superz.aivista.generation.entity.OutboxEvent;
import com.superz.aivista.generation.entity.UserGenerationDailyUsage;
import com.superz.aivista.generation.mapper.GenerationMessageMapper;
import com.superz.aivista.generation.mapper.GenerationSessionMapper;
import com.superz.aivista.generation.mapper.GenerationTaskMapper;
import com.superz.aivista.generation.mapper.OutboxEventMapper;
import com.superz.aivista.generation.mapper.UserGenerationDailyUsageMapper;
import com.superz.aivista.user.mapper.UserMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GenerationTaskCreationServiceTests {
    private static final long USER_ID = 7L;
    private static final Instant NOW = Instant.parse("2026-07-28T01:02:03Z");
    private static final String IDEMPOTENCY_KEY = "b719c741-8607-4b0f-9a72-2dcbfdd6b6ee";

    private final UserMapper userMapper = mock(UserMapper.class);
    private final GenerationSessionMapper sessionMapper = mock(GenerationSessionMapper.class);
    private final GenerationMessageMapper messageMapper = mock(GenerationMessageMapper.class);
    private final GenerationTaskMapper taskMapper = mock(GenerationTaskMapper.class);
    private final UserGenerationDailyUsageMapper dailyUsageMapper = mock(UserGenerationDailyUsageMapper.class);
    private final OutboxEventMapper outboxEventMapper = mock(OutboxEventMapper.class);
    private final GenerationConsentService consentService = mock(GenerationConsentService.class);
    private GenerationTaskCreationService service;

    @BeforeEach
    void setUp() {
        GenerationTaskProperties properties = new GenerationTaskProperties(
                "bailian/qwen-image-2.0", 4, 12, 1000, 500, 1, 6,
                Map.of("1:1", "2048*2048"));
        service = new GenerationTaskCreationService(userMapper, sessionMapper, messageMapper, taskMapper,
                dailyUsageMapper, outboxEventMapper, consentService, properties,
                Clock.fixed(NOW, ZoneOffset.UTC));
        when(consentService.getCurrentConsent(USER_ID))
                .thenReturn(new GenerationConsentResponse("v1", "policy", true, NOW));
        when(userMapper.selectIdForUpdate(USER_ID)).thenReturn(USER_ID);
        when(taskMapper.countActiveByUserId(USER_ID)).thenReturn(0);
        when(dailyUsageMapper.selectByUserIdAndUsageDateForUpdate(anyLong(), any())).thenReturn(null);
        when(sessionMapper.insertSelective(any())).thenAnswer(invocation -> {
            ((GenerationSession) invocation.getArgument(0)).setId(101L);
            return 1;
        });
        when(messageMapper.insertSelective(any())).thenAnswer(invocation -> {
            ((GenerationMessage) invocation.getArgument(0)).setId(201L);
            return 1;
        });
        when(taskMapper.insertSelective(any())).thenAnswer(invocation -> {
            ((GenerationTask) invocation.getArgument(0)).setId(301L);
            return 1;
        });
    }

    @Test
    void createsNewSessionTaskUsageAndOutboxInOneCommand() {
        var response = service.create(USER_ID, IDEMPOTENCY_KEY,
                new CreateGenerationTaskRequest(null, "future city", " ", "1:1", 2));

        assertThat(response.taskId()).isEqualTo("301");
        assertThat(response.sessionId()).isEqualTo("101");
        assertThat(response.status()).isEqualTo("QUEUED");
        assertThat(response.requestedImageCount()).isEqualTo(2);

        ArgumentCaptor<UserGenerationDailyUsage> usage = ArgumentCaptor.forClass(UserGenerationDailyUsage.class);
        ArgumentCaptor<GenerationTask> task = ArgumentCaptor.forClass(GenerationTask.class);
        ArgumentCaptor<OutboxEvent> event = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(dailyUsageMapper).insertSelective(usage.capture());
        verify(taskMapper).insertSelective(task.capture());
        verify(outboxEventMapper).insertSelective(event.capture());
        assertThat(usage.getValue().getRequestedImageCount()).isEqualTo(2);
        assertThat(task.getValue().getFinalPrompt()).isEqualTo("future city");
        assertThat(task.getValue().getFinalNegativePrompt()).isNull();
        assertThat(task.getValue().getWidth()).isEqualTo(2048);
        assertThat(event.getValue().getTaskId()).isEqualTo(301L);
        assertThat(event.getValue().getEventType()).isEqualTo("TASK_EXECUTE");
    }

    @Test
    void returnsExistingTaskForSameIdempotencyKeyWithoutAdditionalWrites() {
        GenerationTask existing = new GenerationTask();
        existing.setId(301L);
        existing.setSessionId(101L);
        existing.setStatus("QUEUED");
        existing.setTaskVersion(0);
        existing.setRequestedImageCount(2);
        existing.setCreatedAt(NOW);
        existing.setRequestFingerprint(GenerationRequestFingerprint.sha256(
                USER_ID, "NEW", "future city", null, "1:1", 2));
        when(taskMapper.selectByUserIdAndIdempotencyKey(USER_ID, IDEMPOTENCY_KEY)).thenReturn(existing);

        var response = service.create(USER_ID, IDEMPOTENCY_KEY,
                new CreateGenerationTaskRequest(null, "future city", null, "1:1", 2));

        assertThat(response.taskId()).isEqualTo("301");
        verify(sessionMapper, never()).insertSelective(any());
        verify(taskMapper, never()).insertSelective(any());
        verify(outboxEventMapper, never()).insertSelective(any());
    }

    @Test
    void rejectsSameIdempotencyKeyWhenFingerprintDiffers() {
        GenerationTask existing = new GenerationTask();
        existing.setRequestFingerprint("different");
        when(taskMapper.selectByUserIdAndIdempotencyKey(USER_ID, IDEMPOTENCY_KEY)).thenReturn(existing);

        assertThatThrownBy(() -> service.create(USER_ID, IDEMPOTENCY_KEY,
                new CreateGenerationTaskRequest(null, "future city", null, "1:1", 2)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.IDEMPOTENCY_KEY_CONFLICT));
    }

    @Test
    void rejectsCreationBeforeAnyWriteWhenConsentIsMissing() {
        when(consentService.getCurrentConsent(USER_ID))
                .thenReturn(new GenerationConsentResponse("v1", "policy", false, null));

        assertThatThrownBy(() -> service.create(USER_ID, IDEMPOTENCY_KEY,
                new CreateGenerationTaskRequest(null, "future city", null, "1:1", 2)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.GENERATION_CONSENT_REQUIRED));
        verify(userMapper, never()).selectIdForUpdate(anyLong());
    }
}
