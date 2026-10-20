"use client";

import { GenerationComposer } from "@/features/generation/ui/generation-composer";
import { AccentSquare, DotMatrix } from "@/shared/ui/editorial-ornaments/editorial-ornaments";
import { type ReactNode } from "react";

export function NewConversationPanel({ toolbar }: { toolbar: ReactNode }) {
  return (
    <main className="relative flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col overflow-hidden bg-[var(--page-bg)] px-5 py-16 pb-24 sm:px-8 lg:min-h-dvh lg:px-12 lg:pt-20 lg:pb-0">
      {toolbar}
      <WorkspaceDecorations />
      <div className="relative z-10 mx-auto flex w-full max-w-[1040px] flex-1 flex-col justify-center lg:-translate-y-5">
        <div className="text-center">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-secondary)]">
            <span className="text-[var(--accent)]">01</span> / START CREATING
          </p>
          <h1 className="mt-6 text-[28px] font-bold leading-[1.25] tracking-tight sm:text-[32px] lg:text-[38px]">
            你好，想创作什么？
          </h1>
          <p className="mt-[14px] text-[15px] leading-6 text-[var(--text-secondary)]">
            写下第一个想法，提交后会自动建立创作会话。
          </p>
        </div>
        <div className="mx-auto mt-10 w-full max-w-[920px]">
          <GenerationComposer />
        </div>
      </div>
      <ArchiveLine label="TURN AN IDEA INTO AN IMAGE" />
    </main>
  );
}

function WorkspaceDecorations() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      <span className="absolute right-[7%] top-[94px] hidden h-[390px] w-[290px] bg-[var(--active-bg)] lg:block" />
      <div className="absolute left-[13%] top-[150px] hidden h-[111px] w-[161px] lg:block">
        <DotMatrix columns={5} rows={5} dotSize={6} gap={16} opacity={0.55} className="absolute left-0 top-0" />
        <AccentSquare size={17} className="absolute bottom-0 right-0" />
      </div>
    </div>
  );
}

function ArchiveLine({ label }: { label: string }) {
  return (
    <div aria-hidden="true" className="relative z-0 mt-auto hidden items-center gap-[14px] pb-[58px] pt-8 lg:flex">
      <span className="size-2 shrink-0 bg-[var(--text-secondary)]" />
      <span className="h-px flex-1 bg-[var(--border-strong)]" />
      <span className="shrink-0 whitespace-nowrap text-[10px] font-medium tracking-[0.18em] text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="size-2 shrink-0 bg-[var(--accent)]" />
    </div>
  );
}
