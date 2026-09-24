import { describe, expect, it } from "vitest";
import { skillActivityText, skillDisplayName } from "./agent-activity-presentation";

describe("agent activity presentation", () => {
  it("uses readable names for every built-in Skill", () => {
    expect(skillDisplayName("monumental-scale-poster")).toBe("巨物尺度清透海报");
    expect(skillDisplayName("series-image-director")).toBe("系列套图");
  });

  it("keeps future Skill names visible", () => {
    expect(skillDisplayName("custom-layout")).toBe("custom-layout");
  });

  it("normalizes the legacy persisted Skill copy", () => {
    expect(skillActivityText("已启用海报设计能力。")).toBe("已加载技能：海报设计");
    expect(skillActivityText("已加载技能：海报设计")).toBe("已加载技能：海报设计");
  });
});
