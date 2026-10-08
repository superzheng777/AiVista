/** 百炼已明确返回的 HTTP/业务错误。原始文案只用于服务端日志。 */
export class BailianProviderError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly providerCode: string | null,
    readonly requestId: string | null,
    message: string,
  ) { super(message); this.name = "BailianProviderError"; }
}

/** HTTP 请求或响应读取失败；生成调用不会自动重试。 */
export class BailianTransportError extends Error {
  constructor(cause: unknown) {
    super("Bailian transport failed", { cause });
    this.name = "BailianTransportError";
  }
}
