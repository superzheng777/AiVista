import { useQueryClient } from "@tanstack/react-query";

/** Prevent a WebSocket/reconnect refresh from refetching every previously loaded cursor page. */
export function retainFirstNotificationPage(client: ReturnType<typeof useQueryClient>, queryKey: readonly string[]) {
  client.setQueryData<{ pages: unknown[]; pageParams: unknown[] }>(queryKey, (current) =>
    current ? { pages: current.pages.slice(0, 1), pageParams: current.pageParams.slice(0, 1) } : current,
  );
  return client.refetchQueries({ queryKey, type: "active" });
}
