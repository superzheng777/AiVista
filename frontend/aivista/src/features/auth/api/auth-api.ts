import type { CurrentUser } from "@/entities/user/model/user";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

type CurrentUserDto = {
  id: string;
  loginName: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
};

type LoginResponseDto = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: CurrentUserDto;
};

export type LoginInput = {
  loginName: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  nickname: string;
};

export type AuthenticatedSession = {
  accessToken: string;
  user: CurrentUser;
};

export type UpdateProfileInput = {
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
};

function toCurrentUser(dto: CurrentUserDto): CurrentUser {
  return {
    id: dto.id,
    loginName: dto.loginName,
    nickname: dto.nickname,
    avatarUrl: dto.avatarUrl,
    bio: dto.bio,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export async function login(input: LoginInput): Promise<AuthenticatedSession> {
  const response = await browserApiClient.post<ApiResponse<LoginResponseDto>>("/auth/login", input);
  const data = unwrapApiResponse(response.data);

  return { accessToken: data.accessToken, user: toCurrentUser(data.user) };
}

export async function register(input: RegisterInput): Promise<CurrentUser> {
  const response = await browserApiClient.post<ApiResponse<CurrentUserDto>>("/auth/register", input);
  return toCurrentUser(unwrapApiResponse(response.data));
}

export async function refreshAccessToken(): Promise<string> {
  const response = await browserApiClient.post<ApiResponse<{ accessToken: string }>>("/auth/refresh");
  return unwrapApiResponse(response.data).accessToken;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await browserApiClient.get<ApiResponse<CurrentUserDto>>("/users/me");
  return toCurrentUser(unwrapApiResponse(response.data));
}

export async function updateCurrentUser(
  input: UpdateProfileInput,
  accessToken: string,
): Promise<CurrentUser> {
  const response = await browserApiClient.put<ApiResponse<CurrentUserDto>>("/users/me", input, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return toCurrentUser(unwrapApiResponse(response.data));
}

export async function logout(): Promise<void> {
  await browserApiClient.post("/auth/logout");
}
