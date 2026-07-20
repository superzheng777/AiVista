package com.superz.aivista.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.superz.aivista.common.exception.BusinessException;
import com.superz.aivista.common.exception.ErrorCode;
import com.superz.aivista.user.dto.UpdateProfileRequest;
import com.superz.aivista.user.entity.User;
import com.superz.aivista.user.mapper.UserMapper;
import com.superz.aivista.user.service.UserProfileService;
import org.junit.jupiter.api.Test;

class UserProfileServiceTests {
    private final UserMapper userMapper = mock(UserMapper.class);
    private final UserProfileService service = new UserProfileService(userMapper);

    @Test
    void rejectsNewNonEmptyAvatarUrlUntilMediaOwnershipExists() {
        when(userMapper.selectOneById(1L)).thenReturn(user());

        assertThatThrownBy(() -> service.updateCurrentUser(
                1L,
                new UpdateProfileRequest("Alice", "https://example.com/avatar.png", null)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.MEDIA_FORBIDDEN));
    }

    @Test
    void updatesAllowedProfileFields() {
        User before = user();
        User after = user();
        after.setNickname("New Alice");
        after.setBio("AI image creator");
        when(userMapper.selectOneById(1L)).thenReturn(before, after);
        when(userMapper.updateProfile(anyLong(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(1);

        var response = service.updateCurrentUser(1L, new UpdateProfileRequest("  New Alice  ", null, "AI image creator"));

        assertThat(response.nickname()).isEqualTo("New Alice");
        assertThat(response.bio()).isEqualTo("AI image creator");
        verify(userMapper).updateProfile(1L, "New Alice", null, "AI image creator");
    }

    private static User user() {
        User user = new User();
        user.setId(1L);
        user.setLoginName("alice");
        user.setPasswordHash("encoded-password");
        user.setNickname("Alice");
        return user;
    }
}
