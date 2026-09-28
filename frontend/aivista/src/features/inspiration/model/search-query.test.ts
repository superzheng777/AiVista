import { describe, expect, it } from "vitest";

import { normalizeSearchInput, searchFormSchema, searchQueryKey } from "@/features/inspiration/model/search-query";

describe("search query", () => {
  it("normalizes width and whitespace without changing the submitted display value", () => {
    expect(normalizeSearchInput("  ＡＩ　 星空  ")).toBe("AI 星空");
    expect(searchQueryKey("ＡＩ")).toBe("ai");
  });

  it("rejects blank and overlong input but accepts a symbol", () => {
    expect(searchFormSchema.safeParse({ keyword: "   " })).toMatchObject({
      success: false,
      error: { issues: [{ message: "请输入搜索关键词" }] },
    });
    expect(searchFormSchema.safeParse({ keyword: "a".repeat(101) })).toMatchObject({
      success: false,
      error: { issues: [{ message: "搜索关键词不能超过 100 个字符" }] },
    });
    expect(searchFormSchema.safeParse({ keyword: "？" }).success).toBe(true);
  });
});
