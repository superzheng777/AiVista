export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8888";
  const authorization = request.headers.get("authorization");
  const headers = new Headers({ Accept: "text/event-stream" });
  if (authorization) headers.set("Authorization", authorization);

  let upstream: Response;
  try {
    upstream = await fetch(`${backendOrigin}/api/events`, {
      headers,
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return new Response(null, { status: 502 });
  }

  const responseHeaders = new Headers({
    "Cache-Control": "no-cache, no-store, no-transform",
    "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
    "X-Accel-Buffering": "no",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
