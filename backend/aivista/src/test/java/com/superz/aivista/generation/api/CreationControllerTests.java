package com.superz.aivista.generation.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.common.exception.GlobalExceptionHandler;
import com.superz.aivista.generation.service.CreationImageService;
import com.superz.aivista.generation.service.CreationRuntimeClient;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class CreationControllerTests {
    private final CreationRuntimeClient runtime = mock(CreationRuntimeClient.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final Authentication auth = new UsernamePasswordAuthenticationToken(4L, null, List.of());
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new CreationController(runtime, mock(CreationImageService.class), jdbc))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void deleteAndRepeatedDeleteReturn204WithoutAResponseBody() throws Exception {
        for (int attempt = 0; attempt < 2; attempt++) {
            mvc.perform(delete("/generation-sessions/6").principal(auth))
                    .andExpect(status().isNoContent()).andExpect(content().string(""));
        }
        verify(runtime, times(2)).request(4L, "DELETE", "/generation-sessions/6", null);
        // The runtime checks ownership including tombstones, so retries reach it too.
        verifyNoInteractions(jdbc);
    }

    @Test
    void deleteRequiresAuthentication() throws Exception {
        mvc.perform(delete("/generation-sessions/6")).andExpect(status().isUnauthorized());
        verifyNoInteractions(runtime);
    }

    @ParameterizedTest
    @EnumSource(value = ErrorCode.class, names = {"SESSION_CREATION_IN_PROGRESS", "GENERATION_RESOURCE_NOT_FOUND"})
    void deletePreservesRuntimeConflictAndNotFoundResponses(ErrorCode error) throws Exception {
        when(runtime.request(4L, "DELETE", "/generation-sessions/6", null)).thenThrow(new BusinessException(error));
        mvc.perform(delete("/generation-sessions/6").principal(auth))
                .andExpect(status().is(error.getHttpStatus().value()))
                .andExpect(jsonPath("$.code").value(error.getCode()));
    }

    @Test
    void deletedSessionsCannotBeReadRenamedOrReachedThroughCreationIds() throws Exception {
        when(jdbc.queryForObject(contains("deleted_at IS NULL"), eq(Integer.class), anyLong(), anyLong())).thenReturn(0);
        mvc.perform(get("/generation-sessions/6").principal(auth)).andExpect(status().isNotFound());
        mvc.perform(patch("/generation-sessions/6").principal(auth).contentType("application/json")
                .content("{\"title\":\"新标题\"}")).andExpect(status().isNotFound());
        mvc.perform(get("/creations/13").principal(auth)).andExpect(status().isNotFound());
        verifyNoInteractions(runtime);
    }
}
