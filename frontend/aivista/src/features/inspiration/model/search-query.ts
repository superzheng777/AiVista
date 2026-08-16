export function normalizeSearchInput(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function searchQueryKey(value: string): string {
  return normalizeSearchInput(value).toLocaleLowerCase();
}

export function validateSearchInput(value: string): string | null {
  const normalized = normalizeSearchInput(value);
  if (!normalized) return "请输入搜索关键词";
  if (Array.from(normalized).length > 100) return "搜索关键词不能超过 100 个字符";
  return null;
}
