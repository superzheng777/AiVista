"use client";
/* eslint-disable @next/next/no-img-element -- previews use short-lived, dynamically signed OSS URLs. */

import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle, Upload, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { getGenerationAsset, listGenerationAssets, uploadGenerationReferenceImage } from "@/features/assets/api/asset-api";

const MAX_REFERENCE_IMAGES = 3;

type GenerationReferenceImagesProps = {
  value: GenerationAsset[];
  disabled: boolean;
  onChange: (images: GenerationAsset[]) => void;
};

type GenerationReferenceImagePickerProps = Omit<GenerationReferenceImagesProps, "disabled"> & {
  disabled: boolean;
  isMenuOpen: boolean;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onMenuOpenChange: (open: boolean) => void;
  renderTrigger: (props: { disabled: boolean; isOpen: boolean; onClick: () => void }) => ReactNode;
};

function thumbnailUrl(asset: GenerationAsset): string | null {
  return asset.imageUrls.thumbnail?.url ?? asset.imageUrls.display?.url ?? null;
}

function ReferenceThumbnail({ asset, onRemove }: { asset: GenerationAsset; onRemove?: () => void }) {
  const url = thumbnailUrl(asset);
  return <span className="group relative inline-flex size-7 shrink-0">
    <span className="size-7 overflow-hidden rounded-[5px] border border-[var(--border-strong)] bg-[var(--surface-soft)]">
      {url ? <img src={url} alt="已添加的参考图片" className="size-full object-cover" /> : <span aria-hidden="true" className="block size-full bg-[var(--border)]" />}
    </span>
    {onRemove ? <button type="button" onClick={onRemove} aria-label="移除参考图片" className="absolute -right-1.5 -top-1.5 inline-flex size-4 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--surface-bg)] opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"><X className="size-3" /></button> : null}
    {url ? <span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 hidden w-40 -translate-x-1/2 overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] p-1 shadow-lg group-hover:block"><img src={url} alt="参考图片预览" className="aspect-square w-full object-cover" /></span> : null}
  </span>;
}

function AssetPickerDialog({ selected, onClose, onComplete }: { selected: GenerationAsset[]; onClose: () => void; onComplete: (images: GenerationAsset[]) => void }) {
  const [draft, setDraft] = useState(selected);
  const assets = useQuery({ queryKey: ["assets", "reference-picker"], queryFn: listGenerationAssets });

  function toggle(asset: GenerationAsset): void {
    setDraft((current) => {
      const existingIndex = current.findIndex((image) => image.id === asset.id);
      if (existingIndex >= 0) return current.filter((image) => image.id !== asset.id);
      return current.length >= MAX_REFERENCE_IMAGES ? current : [...current, asset];
    });
  }

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div role="dialog" aria-modal="true" aria-labelledby="reference-asset-picker-title" className="fixed inset-0 z-50 grid place-items-center bg-[var(--primary)]/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="flex max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-3xl flex-col rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div><h2 id="reference-asset-picker-title" className="text-lg font-semibold">从资产添加</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">最多选择 3 张参考图片，顺序即提交给模型的顺序。</p></div>
        <button type="button" onClick={onClose} aria-label="关闭资产选择" className="inline-flex size-9 items-center justify-center rounded-[6px] hover:bg-[var(--surface-soft)]"><X className="size-5" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {assets.isLoading ? <div className="flex min-h-40 items-center justify-center text-sm text-[var(--text-secondary)]"><LoaderCircle className="mr-2 size-4 animate-spin" />正在读取资产…</div> : null}
        {assets.isError ? <div role="alert" className="text-sm text-destructive">资产加载失败，请关闭后重试。</div> : null}
        {assets.data?.length === 0 ? <p className="py-12 text-center text-sm text-[var(--text-secondary)]">你还没有可用的图片资产。</p> : null}
        {assets.data?.length ? <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {assets.data.map((asset) => {
            const isSelected = draft.some((image) => image.id === asset.id);
            const unavailable = !isSelected && draft.length >= MAX_REFERENCE_IMAGES;
            const url = thumbnailUrl(asset);
            return <button key={asset.id} type="button" onClick={() => toggle(asset)} disabled={unavailable} aria-pressed={isSelected} className={`group relative aspect-square overflow-hidden rounded-[7px] border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${isSelected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--accent-border)]"} disabled:cursor-not-allowed disabled:opacity-45`}>
              {url ? <img src={url} alt="选择此资产作为参考图片" loading="lazy" className="size-full object-cover" /> : <span className="block size-full bg-[var(--surface-soft)]" />}
              {isSelected ? <span className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">{draft.findIndex((image) => image.id === asset.id) + 1}</span> : null}
            </button>;
          })}
        </div> : null}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4"><span className="text-sm text-[var(--text-secondary)]">已选择 {draft.length} / {MAX_REFERENCE_IMAGES}</span><div className="flex gap-2"><button type="button" onClick={onClose} className="h-9 rounded-[6px] px-3 text-sm font-medium text-[var(--text-secondary)]">取消</button><button type="button" onClick={() => onComplete(draft)} className="h-9 rounded-[6px] bg-[var(--primary)] px-4 text-sm font-medium text-[var(--surface-bg)]">完成</button></div></footer>
    </section>
  </div>;
}

export function GenerationReferenceImages({ value, disabled, onChange }: GenerationReferenceImagesProps) {
  if (!value.length) return null;
  return <div className="flex min-h-7 flex-wrap items-center gap-1.5 px-6 pb-1 sm:px-[26px]" aria-label="已添加的参考图片">
    {value.map((asset, index) => <ReferenceThumbnail key={asset.id} asset={asset} onRemove={disabled ? undefined : () => onChange(value.filter((_, currentIndex) => currentIndex !== index))} />)}
  </div>;
}

export function GenerationReferenceImagePicker({ value, disabled, isMenuOpen, isAuthenticated, onRequireAuth, onChange, onMenuOpenChange, renderTrigger }: GenerationReferenceImagePickerProps) {
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => getGenerationAsset((await uploadGenerationReferenceImage(file)).assetId),
    onSuccess: (asset) => onChange([...value, asset].slice(0, MAX_REFERENCE_IMAGES)),
  });

  function requireAuth(): boolean {
    if (isAuthenticated) return false;
    onRequireAuth();
    return true;
  }

  function selectLocal(): void {
    onMenuOpenChange(false);
    if (requireAuth()) return;
    fileInput.current?.click();
  }

  function selectAsset(): void {
    onMenuOpenChange(false);
    if (requireAuth()) return;
    setAssetPickerOpen(true);
  }

  return <>
    {value.length < MAX_REFERENCE_IMAGES ? <span className="relative inline-flex">
      {renderTrigger({ disabled: disabled || upload.isPending, isOpen: isMenuOpen, onClick: () => onMenuOpenChange(!isMenuOpen) })}
      {isMenuOpen ? <div role="menu" className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-40 rounded-[9px] border border-[var(--border)] bg-[var(--surface-bg)] p-1.5 shadow-[0_8px_18px_rgb(43_35_25_/_14%)]"><button type="button" role="menuitem" onClick={selectLocal} className="flex h-9 w-full items-center gap-2 rounded-[5px] px-2 text-left text-sm hover:bg-[var(--surface-soft)]"><Upload className="size-4" />从本地添加</button><button type="button" role="menuitem" onClick={selectAsset} className="flex h-9 w-full items-center gap-2 rounded-[5px] px-2 text-left text-sm hover:bg-[var(--surface-soft)]"><ImagePlus className="size-4" />从资产添加</button></div> : null}
    </span> : null}
    {upload.isError ? <span role="alert" className="text-xs text-destructive">图片上传失败，请选择 PNG 或 JPEG 后重试。</span> : null}
    <input ref={fileInput} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) upload.mutate(file); }} />
    {assetPickerOpen ? <AssetPickerDialog selected={value} onClose={() => setAssetPickerOpen(false)} onComplete={(images) => { onChange(images); setAssetPickerOpen(false); }} /> : null}
  </>;
}
