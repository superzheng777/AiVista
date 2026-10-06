import { describe, expect, it } from "vitest";

import { authFormSchema } from "@/features/auth/model/auth-form";

const registration = {
  loginName: "alice_2026",
  nickname: "Alice",
  password: "Aivista2026",
  confirmPassword: "Aivista2026",
  acceptedAgreement: true,
};

describe("auth form", () => {
  it("validates registration fields together", () => {
    expect(authFormSchema("register").safeParse(registration).success).toBe(true);
    expect(
      authFormSchema("register").safeParse({
        ...registration,
        password: "allletters",
        confirmPassword: "different",
        acceptedAgreement: false,
      }),
    ).toMatchObject({
      success: false,
      error: {
        issues: [{ path: ["password"] }, { path: ["confirmPassword"] }, { path: ["acceptedAgreement"] }],
      },
    });
  });

  it("does not require registration-only fields when logging in", () => {
    expect(
      authFormSchema("login").safeParse({
        ...registration,
        nickname: "",
        confirmPassword: "",
        acceptedAgreement: false,
      }).success,
    ).toBe(true);
  });

  it("uses the same letter and decimal-digit categories as the server", () => {
    const schema = authFormSchema("register");
    expect(schema.safeParse({ ...registration, password: "Letters①②", confirmPassword: "Letters①②" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...registration, password: "ⅣⅣⅣⅣⅣⅣⅣ1", confirmPassword: "ⅣⅣⅣⅣⅣⅣⅣ1" }).success).toBe(true);
  });
});
