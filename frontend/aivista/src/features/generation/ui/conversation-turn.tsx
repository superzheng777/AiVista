"use client";
/* eslint-disable @next/next/no-img-element */

import { CircleStop, LoaderCircle } from "lucide-react";
import type { AgentInputForm, GenerationAsset } from "@/entities/generation/model/generation";
import { isActiveCreation, type CreationTurn, type SessionItem } from "@/entities/generation/model/session";
import { AgentInputFormCard } from "./agent-input-form-card";
import { AgentProcess } from "./agent-process";
import { GenerationImageCard } from "./generation-image-card";

const statusText: Record<CreationTurn["status"], string> = {
  QUEUED: "创作排队中",
  RUNNING: "正在创作",
  WAITING_INPUT: "等待确认",
  SUCCEEDED: "创作完成",
  PARTIALLY_SUCCEEDED: "部分图片已生成",
  FAILED: "创作失败",
  CANCELLED: "创作已取消",
};

export function ConversationTurn({
  turn,
  cancelling,
  submittingFormId,
  onCancel,
  onResolve,
  onOpen,
  onRefresh,
  onFavorite,
  onPublish,
  onDelete,
}: {
  turn: CreationTurn;
  cancelling: boolean;
  submittingFormId: string | null;
  onCancel: () => void;
  onResolve: (toolCallId: string, action: "SUBMIT" | "SKIP", form: AgentInputForm | null) => void;
  onOpen: (id: string) => void;
  onRefresh: (id: string) => Promise<GenerationAsset>;
  onFavorite: (asset: GenerationAsset) => void;
  onPublish: (asset: GenerationAsset) => void;
  onDelete: (asset: GenerationAsset) => void;
}) {
  const active = isActiveCreation(turn.status);
  const forms = turn.items.filter((item) => item.kind === "form");
  const final = turn.items.filter(
    (item): item is Extract<SessionItem, { kind: "text" }> => item.kind === "text" && item.phase === "final",
  );
  const generations = turn.items.filter((item) => item.kind === "generation");
  const images = [
    ...new Map(generations.flatMap((item) => item.assets).map((asset) => [asset.assetId, asset])).values(),
  ];
  return (
    <article aria-label="创作对话" className="mb-6 w-full max-w-[920px]">
      <div className="flex justify-end">
        <div aria-label="用户需求" className="max-w-[85%] rounded-[10px] bg-[var(--active-bg)] px-4 py-3">
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{turn.input.prompt}</p>
          {turn.input.assets.length ? (
            <div className="mt-3 flex gap-2">
              {turn.input.assets.map((asset) =>
                asset.url ? (
                  <button key={asset.assetId} onClick={() => onOpen(asset.assetId)}>
                    <img src={asset.url} alt="参考图片" className="size-20 rounded-[6px] object-cover" />
                  </button>
                ) : (
                  <span key={asset.assetId} className="text-xs">
                    参考图片已不可用
                  </span>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-5 flex justify-start" aria-label="AI 回复">
        <div className="w-full max-w-[920px] rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-4 shadow-[0_2px_4px_rgb(43_35_25_/_3%)] sm:p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-hover)]">
              <span className="size-[11px] bg-[var(--accent)]" />
              AiVista
            </p>
            <div className="flex items-center gap-2">
              <span
                role="status"
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--accent)]"
              >
                {active && turn.status !== "WAITING_INPUT" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                {statusText[turn.status]}
              </span>
              {active ? (
                <button
                  onClick={onCancel}
                  disabled={cancelling || !!submittingFormId}
                  className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-[var(--border-strong)] px-2 text-xs disabled:opacity-50"
                >
                  <CircleStop className="size-3.5" />
                  {cancelling ? "正在停止" : "停止"}
                </button>
              ) : null}
            </div>
          </div>
          {turn.mode === "AGENT" ? (
            <AgentProcess items={turn.items} active={turn.status === "RUNNING" || turn.status === "QUEUED"} />
          ) : null}
          {forms.length ? (
            <section aria-label="表单操作">
              {forms.map((item) => (
                <AgentInputFormCard
                  key={item.id}
                  value={item}
                  enabled={turn.status === "WAITING_INPUT" && item.status === "PENDING"}
                  submitting={submittingFormId === item.toolCallId}
                  cancelling={cancelling}
                  onCancel={onCancel}
                  onResolve={(action, form) => onResolve(item.toolCallId, action, form)}
                />
              ))}
            </section>
          ) : null}
          {final.length ? (
            <section aria-label="AI 最终回复" className="mt-3 space-y-2">
              {final.map((item) => (
                <p key={item.id} className="whitespace-pre-wrap break-words text-sm leading-7">
                  {item.text}
                </p>
              ))}
            </section>
          ) : null}
          {turn.mode === "NORMAL" && turn.settings.negativePrompt ? (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">负面提示词：{turn.settings.negativePrompt}</p>
          ) : null}
          {turn.status === "FAILED" ? (
            <p role="alert" className="mt-3 text-sm text-[var(--accent-hover)]">
              本次创作失败，请稍后重试。
            </p>
          ) : null}
          {generations.length ? (
            <section aria-label="图片展示区域" className="mt-4">
              <p className="mb-2 text-xs text-[var(--text-secondary)]">
                {images.length} 张图片
                {generations.some((item) => isActiveCreation(item.status)) ? " · 生成中…" : "已生成"}
              </p>
              {generations.some((item) => item.status === "FAILED") ? (
                <p role="alert" className="mb-2 text-xs text-[var(--accent-hover)]">
                  部分图片生成失败。
                </p>
              ) : null}
              <div aria-label={`${images.length} 张生成图片`} className="flex gap-2 overflow-x-auto pb-2">
                {images.map((image) => (
                  <div key={image.assetId} className="w-[180px] shrink-0 sm:w-[220px]">
                    <GenerationImageCard
                      image={image}
                      onOpen={() => onOpen(image.assetId)}
                      onRefresh={() => onRefresh(image.assetId)}
                      onFavorite={onFavorite}
                      onPublish={onPublish}
                      onDelete={onDelete}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
      <div aria-hidden="true" className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--border-strong)]" />
        <span className="text-[10px] tracking-[0.18em] text-[var(--text-secondary)]">CREATED FROM YOUR IDEA</span>
        <span className="size-2 bg-[var(--accent)]" />
        <span className="h-px flex-1 bg-[var(--border-strong)]" />
      </div>
    </article>
  );
}
