import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { retainFirstNotificationPage } from "@/features/official-notifications/ui/official-notifications-bell";

describe("retainFirstNotificationPage", () => {
  it("keeps only the first cursor page before an active refetch", async () => {
    const client = new QueryClient();
    const key = ["interaction-notifications", "list"] as const;
    client.setQueryData(key, { pages: [{ items: ["new"] }, { items: ["old"] }], pageParams: [null, "cursor-1"] });

    await retainFirstNotificationPage(client, key);

    expect(client.getQueryData(key)).toEqual({ pages: [{ items: ["new"] }], pageParams: [null] });
  });

  it("does nothing when the message list has not been fetched", async () => {
    const client = new QueryClient();
    await retainFirstNotificationPage(client, ["official-notifications", "list"]);
    expect(client.getQueryData(["official-notifications", "list"])).toBeUndefined();
  });
});
