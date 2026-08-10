import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("合并类名并解决冲突", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("bg-red-500", "text-white")).toBe("bg-red-500 text-white");
  });
});

describe("React Testing Library", () => {
  it("可以渲染并断言组件", () => {
    render(<button type="button">你好</button>);
    expect(screen.getByRole("button", { name: "你好" })).toBeInTheDocument();
  });
});
