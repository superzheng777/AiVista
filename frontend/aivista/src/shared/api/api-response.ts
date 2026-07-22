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

export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  if (response.code !== 0) {
    throw new Error(response.message);
  }

  return response.data;
}
