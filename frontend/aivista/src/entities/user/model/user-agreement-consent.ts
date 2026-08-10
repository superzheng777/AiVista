/** 当前用户对《用户协议》的确认状态。与后端 `USER_AGREEMENT` consent 对齐。 */
export type UserAgreementConsent = {
  policyVersion: string;
  policyContent: string;
  /** 是否已确认当前生效版本。false 表示尚未确认或版本已过期。 */
  consented: boolean;
  consentedAt: string | null;
};
