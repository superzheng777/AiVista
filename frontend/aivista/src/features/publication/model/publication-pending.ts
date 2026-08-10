import type { SubmitPublicationInput } from "@/features/publication/api/publication-api";

const PENDING_PUBLICATION_STORAGE_PREFIX = "aivista.pending-publication-submission";
const PENDING_PUBLICATION_MAX_AGE_MS = 10 * 60 * 1_000;

type StoredPendingPublication = {
  userId: string;
  imageId: string;
  input: SubmitPublicationInput;
  idempotencyKey: string;
  createdAt: number;
};

/** 按 imageId 分槽：同图复用同一 key 的幂等语义只在该图槽位内成立，互不覆盖。 */
function pendingStorageKeyOf(imageId: string): string {
  return `${PENDING_PUBLICATION_STORAGE_PREFIX}.${imageId}`;
}

export function createPublicationIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function storePendingPublication(record: StoredPendingPublication): void {
  window.sessionStorage.setItem(pendingStorageKeyOf(record.imageId), JSON.stringify(record));
}

export function readPendingPublication(imageId: string): StoredPendingPublication | null {
  try {
    const raw = window.sessionStorage.getItem(pendingStorageKeyOf(imageId));
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== "object") return null;
    const value = stored as Partial<StoredPendingPublication>;
    if (typeof value.userId !== "string" || typeof value.imageId !== "string"
      || typeof value.idempotencyKey !== "string" || typeof value.createdAt !== "number"
      || !value.input || typeof value.input !== "object") return null;
    return value as StoredPendingPublication;
  } catch {
    return null;
  }
}

export function clearPendingPublication(imageId: string): void {
  window.sessionStorage.removeItem(pendingStorageKeyOf(imageId));
}

/** 清空当前会话所有发布的待恢复记录（退出登录或匿名时调用）。 */
export function clearAllPendingPublications(): void {
  const keys = Object.keys(window.sessionStorage).filter((key) =>
    key.startsWith(PENDING_PUBLICATION_STORAGE_PREFIX));
  for (const key of keys) {
    window.sessionStorage.removeItem(key);
  }
}

export { PENDING_PUBLICATION_STORAGE_PREFIX, PENDING_PUBLICATION_MAX_AGE_MS };
