import type { UserAgreementConsent } from "@/entities/user/model/user-agreement-consent";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

type UserAgreementConsentDto = {
  policyVersion: string;
  policyContent: string;
  consented: boolean;
  consentedAt: string | null;
};

export const userAgreementQueryKeys = {
  all: ["user-agreement"] as const,
  consent: () => [...userAgreementQueryKeys.all, "consent"] as const,
};

function toConsent(dto: UserAgreementConsentDto): UserAgreementConsent {
  return {
    policyVersion: dto.policyVersion,
    policyContent: dto.policyContent,
    consented: dto.consented,
    consentedAt: dto.consentedAt,
  };
}

/** 查询当前用户对《用户协议》的确认状态与当前生效版本、文案。 */
export async function getUserAgreementConsent(): Promise<UserAgreementConsent> {
  const response = await browserApiClient.get<ApiResponse<UserAgreementConsentDto>>("/users/me/consents/user-agreement");
  return toConsent(unwrapApiResponse(response.data));
}

/** 确认当前生效版本的《用户协议》。幂等：重复确认同一版本返回同一结果。 */
export async function confirmUserAgreement(policyVersion: string): Promise<UserAgreementConsent> {
  const response = await browserApiClient.post<ApiResponse<UserAgreementConsentDto>>(
    "/users/me/consents/user-agreement",
    { policyVersion },
  );
  return toConsent(unwrapApiResponse(response.data));
}
