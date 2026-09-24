import { describe, expect, it } from "vitest";
import { environmentSchema } from "../src/config/environment.js";

describe("environmentSchema", () => {
  it("keeps Langfuse disabled by default and accepts empty key placeholders", () => {
    const environment = environmentSchema.parse({
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
    });

    expect(environment.AIVISTA_LANGFUSE_ENABLED).toBe(false);
    expect(environment.LANGFUSE_PUBLIC_KEY).toBeUndefined();
    expect(environment.LANGFUSE_SECRET_KEY).toBeUndefined();
    expect(environment.LANGFUSE_BASE_URL).toBe("https://cloud.langfuse.com");
  });

  it("requires both Langfuse keys when observability is enabled", () => {
    const result = environmentSchema.safeParse({ AIVISTA_LANGFUSE_ENABLED: "true" });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected environment validation to fail");
    expect(result.error.issues.map((issue) => issue.path.join(".")))
      .toEqual(expect.arrayContaining(["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"]));
  });

  it("accepts an enabled Langfuse Cloud configuration", () => {
    const environment = environmentSchema.parse({
      AIVISTA_LANGFUSE_ENABLED: "true",
      LANGFUSE_PUBLIC_KEY: "pk-lf-test",
      LANGFUSE_SECRET_KEY: "sk-lf-test",
      LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com",
    });

    expect(environment).toMatchObject({
      AIVISTA_LANGFUSE_ENABLED: true,
      LANGFUSE_PUBLIC_KEY: "pk-lf-test",
      LANGFUSE_SECRET_KEY: "sk-lf-test",
      LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com",
    });
  });
});
