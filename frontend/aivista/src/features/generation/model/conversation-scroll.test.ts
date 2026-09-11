import { describe, expect, it } from "vitest";

import {
  BOTTOM_FOLLOW_THRESHOLD_PX,
  nextBottomFollowState,
} from "@/features/generation/model/conversation-scroll";

describe("conversation bottom following", () => {
  it("keeps following while content grows and the user has not scrolled up", () => {
    expect(nextBottomFollowState(true, 320, false)).toBe(true);
  });

  it("pauses after an upward scroll beyond the threshold", () => {
    expect(
      nextBottomFollowState(true, BOTTOM_FOLLOW_THRESHOLD_PX + 1, true),
    ).toBe(false);
  });

  it("resumes when the user returns near the bottom", () => {
    expect(
      nextBottomFollowState(false, BOTTOM_FOLLOW_THRESHOLD_PX, false),
    ).toBe(true);
  });
});
