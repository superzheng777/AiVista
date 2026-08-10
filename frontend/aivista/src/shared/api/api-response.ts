import { isAxiosError } from "axios";

export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export function getApiErrorCode(error: unknown): number | null {
  if (!isAxiosError<ApiResponse<unknown>>(error)) {
    return null;
  }

  return error.response?.data?.code ?? null;
}

/** 返回服务端已明确给出的业务文案；网络错误和非标准响应返回 null。 */
export function getApiErrorMessage(error: unknown): string | null {
  if (!isAxiosError<ApiResponse<unknown>>(error)) {
    return null;
  }
  const message = error.response?.data?.message;
  return typeof message === "string" && message.trim() ? message : null;
}

export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  if (response.code !== 0) {
    throw new Error(response.message);
  }

  return response.data;
}
