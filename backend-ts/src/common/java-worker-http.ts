import { z } from "zod";

const errorSchema = z.object({ code: z.number().int(), message: z.string() }).passthrough();

export class JavaWorkerApiError extends Error {
  constructor(readonly status: number, readonly code: number | undefined, message: string) {
    super(message);
    this.name = "JavaWorkerApiError";
  }
}

/** Retries only idempotent worker PUTs and always reuses the same resource identity. */
export async function putJavaWorker(options: {
  url: string;
  token: string;
  body: unknown;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  fallbackError: string;
}): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    options.signal?.throwIfAborted();
    try {
      const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
      const response = await fetch(options.url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-AiVista-Worker-Token": options.token },
        body: JSON.stringify(options.body),
        signal: options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal,
      });
      if (response.ok) return response;
      const error = await javaWorkerError(response, options.fallbackError);
      if (response.status < 500 || attempt === 2) throw error;
    } catch (error) {
      if (options.signal?.aborted || (error instanceof JavaWorkerApiError && error.status < 500)
          || attempt === 2) throw error;
    }
    await abortableDelay(100 * (attempt + 1), options.signal);
  }
  throw new Error("Java worker retry loop exhausted");
}

export async function javaWorkerError(response: Response, fallback: string): Promise<JavaWorkerApiError> {
  try {
    const parsed = errorSchema.safeParse(await response.json());
    if (parsed.success) {
      return new JavaWorkerApiError(response.status, parsed.data.code, parsed.data.message);
    }
  } catch {
    // Infrastructure responses need no body exposure.
  }
  return new JavaWorkerApiError(response.status, undefined, fallback);
}

async function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); resolve(); }, milliseconds);
    const aborted = () => { clearTimeout(timer); cleanup(); reject(signal?.reason); };
    const cleanup = () => signal?.removeEventListener("abort", aborted);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}
