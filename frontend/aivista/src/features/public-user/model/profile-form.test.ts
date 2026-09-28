import { describe, expect, it } from "vitest";

import { profileFormSchema } from "@/features/public-user/model/profile-form";

describe("profile form", () => {
  it("accepts an empty bio and rejects blank nicknames or excessive text", () => {
    expect(profileFormSchema.safeParse({ nickname: "Alice", bio: "" }).success).toBe(true);
    expect(profileFormSchema.safeParse({ nickname: "  ", bio: "" }).success).toBe(false);
    expect(profileFormSchema.safeParse({ nickname: "Alice", bio: "a".repeat(501) }).success).toBe(false);
  });
});
