"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { UserAgreementConsent } from "@/entities/user/model/user-agreement-consent";
import {
  confirmUserAgreement,
  getUserAgreementConsent,
  userAgreementQueryKeys,
} from "@/shared/api/user-agreement-consent-api";

/**
 * 当前用户《用户协议》确认状态与确认动作。
 * 供生成等登录态操作复用；query key 全局一致，跨页面共享同一份缓存。
 * `onConfirmed` 在确认成功、缓存已更新后执行，用于触发调用方后续流程。
 */
export function useUserAgreementConsent(enabled = true, onConfirmed?: (consent: UserAgreementConsent) => void) {
  const queryClient = useQueryClient();
  const consentQuery = useQuery({
    queryKey: userAgreementQueryKeys.consent(),
    queryFn: getUserAgreementConsent,
    enabled,
    retry: false,
  });
  const confirmConsent = useMutation({
    mutationFn: confirmUserAgreement,
    onSuccess: (consent) => {
      queryClient.setQueryData(userAgreementQueryKeys.consent(), consent);
      onConfirmed?.(consent);
    },
  });

  return { consentQuery, confirmConsent };
}
