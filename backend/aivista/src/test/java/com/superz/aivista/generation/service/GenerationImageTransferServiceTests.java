package com.superz.aivista.generation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.aliyun.oss.OSS;
import com.aliyun.oss.model.ProcessObjectRequest;
import com.superz.aivista.generation.config.GenerationImageTransferProperties;
import com.superz.aivista.generation.config.GenerationOssProperties;
import com.superz.aivista.generation.entity.GenerationTask;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URL;
import java.net.URLConnection;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GenerationImageTransferServiceTests {

    @Test
    void passesUnreadProviderStreamDirectlyToOssAndCountsConsumedBytes() throws Exception {
        byte[] payload = new byte[32 * 1024];
        AtomicInteger sourceBytesRead = new AtomicInteger();
        InputStream source = new ByteArrayInputStream(payload) {
            @Override
            public synchronized int read(byte[] bytes, int offset, int length) {
                int read = super.read(bytes, offset, Math.min(length, 1024));
                if (read > 0) {
                    sourceBytesRead.addAndGet(read);
                }
                return read;
            }

            @Override
            public synchronized int read() {
                int value = super.read();
                if (value >= 0) {
                    sourceBytesRead.incrementAndGet();
                }
                return value;
            }
        };
        URLConnection connection = new URLConnection(new URL("https://provider.example/image.png")) {
            @Override
            public void connect() {
            }

            @Override
            public InputStream getInputStream() {
                return source;
            }
        };
        OSS oss = mock(OSS.class);
        doAnswer(invocation -> {
            assertThat(sourceBytesRead).hasValue(0);
            InputStream upload = invocation.getArgument(2);
            upload.transferTo(OutputStream.nullOutputStream());
            return null;
        }).when(oss).putObject(anyString(), anyString(), any(InputStream.class), any());
        GenerationImageTransferService service = new GenerationImageTransferService(oss,
                new GenerationOssProperties("endpoint", "bucket", "id", "secret", "users",
                        Duration.ofMinutes(10), Duration.ofSeconds(5), Duration.ofSeconds(30)),
                new GenerationImageTransferProperties(Duration.ofSeconds(5), Duration.ofSeconds(30))) {
            @Override
            URLConnection openConnection(URI uri) throws IOException {
                return connection;
            }
        };
        GenerationTask task = new GenerationTask();
        task.setId(301L);
        task.setUserId(7L);
        task.setWidth(2048);
        task.setHeight(2048);

        List<GenerationImageTransferService.TransferredImage> result = service.transfer(
                task, List.of("https://provider.example/image.png"));

        assertThat(result).singleElement().satisfies(image -> {
            assertThat(image.objectKey()).isEqualTo("users/7/tasks/301/0");
            assertThat(image.fileSize()).isEqualTo(payload.length);
        });
        assertThat(sourceBytesRead).hasValue(payload.length);
        ArgumentCaptor<ProcessObjectRequest> requests = ArgumentCaptor.forClass(ProcessObjectRequest.class);
        verify(oss, times(2)).processObject(requests.capture());
        assertThat(requests.getAllValues()).extracting(ProcessObjectRequest::getProcess).containsExactly(
                "image/resize,l_640/format,webp/quality,Q_80|sys/saveas,o_dXNlcnMvNy90YXNrcy8zMDEvMC9jYXJkLndlYnA,b_YnVja2V0",
                "image/resize,l_1600/format,webp/quality,Q_85|sys/saveas,o_dXNlcnMvNy90YXNrcy8zMDEvMC9kaXNwbGF5LndlYnA,b_YnVja2V0");
    }
}
