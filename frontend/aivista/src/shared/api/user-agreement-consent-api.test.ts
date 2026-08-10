import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/browser-client", () => ({
  browserApiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import { browserApiClient } from "@/shared/api/browser-client";
import {
  confirmUserAgreement,
  getUserAgreementConsent,
} from "@/shared/api/user-agreement-consent-api";

const client = vi.mocked(browserApiClient);
const okEnvelope = { code: 0, message: "ok" } as const;

function responseData<T>(data: T): never {
  return { data: { ...okEnvelope, data } } as never;
}

const consentDto = {
  policyVersion: "v1",
  policyContent: "用户协议正文",
  consented: false,
  consentedAt: null,
};

describe("user-agreement-consent-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getUserAgreementConsent 查询并映射 DTO", async () => {
    client.get.mockResolvedValue(responseData(consentDto));
    const result = await getUserAgreementConsent();
    expect(client.get).toHaveBeenCalledWith("/users/me/consents/user-agreement");
    expect(result).toEqual({
      policyVersion: "v1",
      policyContent: "用户协议正文",
      consented: false,
      consentedAt: null,
    });
  });

  it("confirmUserAgreement 提交版本并映射确认结果", async () => {
    client.post.mockResolvedValue(responseData({ ...consentDto, consented: true, consentedAt: "2026-08-10T00:00:00Z" }));
    const result = await confirmUserAgreement("v1");
    expect(client.post).toHaveBeenCalledWith("/users/me/consents/user-agreement", { policyVersion: "v1" });
    expect(result).toEqual({
      policyVersion: "v1",
      policyContent: "用户协议正文",
      consented: true,
      consentedAt: "2026-08-10T00:00:00Z",
    });
  });
});
