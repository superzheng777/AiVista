export type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  if (response.code !== 0) {
    throw new Error(response.message);
  }

  return response.data;
}
