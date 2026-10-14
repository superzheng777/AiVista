"use client";

import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { cn } from "@/shared/lib/cn";
import Link from "next/link";
import type { ReactNode } from "react";
import type { groupsOf } from "../model/asset-groups";

const ASSET_GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6 lg:gap-3 min-[1320px]:gap-[18px]";

export function AssetSkeleton() {
  return (
    <div className={cn("mt-8", ASSET_GRID_CLASS)}>
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="aspect-square animate-pulse rounded-[8px] bg-[var(--skeleton)]" />
      ))}
    </div>
  );
}

export function EmptyAssets() {
  return (
    <section className="mx-auto mt-24 max-w-[420px] text-center">
      <div aria-hidden="true" className="relative mx-auto h-14 w-16">
        <span className="absolute left-2 top-0 size-9 border border-[var(--text-secondary)]" />
        <span className="absolute bottom-0 right-1 size-9 border border-[var(--primary)]" />
        <span className="absolute bottom-1 left-0 size-2 bg-[var(--accent)]" />
        <span className="absolute right-0 top-0 text-lg leading-none text-[var(--primary)]">✦</span>
      </div>
      <h2 className="mt-5 text-xl font-bold">还没有创作资产</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">完成一次图片生成后，作品会保存在这里</p>
      <Link
        href="/generate"
        className="mt-6 inline-flex h-11 items-center rounded-[7px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--surface-bg)]"
      >
        开始创作
      </Link>
    </section>
  );
}

export function AssetGroups({
  groups,
  renderAsset,
}: {
  groups: ReturnType<typeof groupsOf>;
  renderAsset: (asset: GenerationAsset) => ReactNode;
}) {
  return (
    <div className="space-y-12">
      {groups.map((group) => (
        <section key={group.key}>
          <div className="mb-[18px] flex items-center">
            <h2 className="shrink-0 whitespace-nowrap text-[21px] font-bold tracking-tight sm:text-[26px]">
              {group.label}
            </h2>
            <p className="ml-5 shrink-0 whitespace-nowrap text-sm text-[var(--text-secondary)] sm:ml-[38px]">
              {group.weekday} · {group.items.length} 项
            </p>
            <span className="ml-4 h-px flex-1 bg-[var(--border)] sm:ml-[22px]" />
            <span className="ml-3 size-[10px] shrink-0 bg-[var(--accent)] sm:ml-5" />
          </div>
          <div className={ASSET_GRID_CLASS}>{group.items.map(renderAsset)}</div>
        </section>
      ))}
    </div>
  );
}
