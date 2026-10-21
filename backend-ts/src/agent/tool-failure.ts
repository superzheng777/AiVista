/** Pi execution errors and the business failure markers returned by AiVista tools. */
export function isToolFailure(result: unknown, isError: boolean): boolean {
  if (isError) return true;
  if (!result || typeof result !== "object") return false;
  const details: unknown = Reflect.get(result, "details");
  return details !== null && typeof details === "object"
    && (Reflect.get(details, "outcome") === "FAILED" || Reflect.get(details, "status") === "FAILED");
}
