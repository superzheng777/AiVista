import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InspirationSearchForm } from "@/features/inspiration/ui/inspiration-search-form";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

describe("InspirationSearchForm", () => {
  beforeEach(() => navigation.push.mockReset());

  it("validates the keyword then navigates with its original value", async () => {
    render(<InspirationSearchForm />);
    fireEvent.submit(screen.getByRole("search"));
    expect(await screen.findByRole("alert")).toHaveTextContent("请输入搜索关键词");
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "搜索公开作品" }), { target: { value: "  ＡＩ 星空  " } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/inspirations/search?q=%20%20%EF%BC%A1%EF%BC%A9%20%E6%98%9F%E7%A9%BA%20%20",
      ),
    );
  });
});
