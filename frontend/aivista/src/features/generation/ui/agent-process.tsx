"use client";

import { ChevronRight, LoaderCircle, Wrench } from "lucide-react";
import { useState } from "react";
import type { SessionItem } from "@/entities/generation/model/session";
import { cn } from "@/shared/lib/cn";
import styles from "./agent-process.module.css";
import {
  processSteps,
  skillDisplayName,
  toolActivityProgress,
  type ToolActivityGroup,
} from "../model/agent-activity-presentation";

export function AgentProcess({ items, active }: { items: SessionItem[]; active: boolean }) {
  const [open, setOpen] = useState(active);
  const steps = processSteps(items);
  if (!steps.length && !active) return null;
  return (
    <details
      aria-label="创作过程"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group mt-3 rounded-[7px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-[var(--text-secondary)]">
        <span className="flex items-center gap-2">
          {active ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
          {active ? "创作中" : "已完成"}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
      </summary>
      <ol aria-label="创作步骤" className="mt-2 space-y-1.5 border-t border-[var(--border)] pt-2">
        {steps.map((step) => (
          <li key={step.id} className="space-y-1">
            {step.activities.map((item) =>
              item.kind === "text" ? (
                <p key={item.id} className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--primary)]">
                  {item.text.trim()}
                </p>
              ) : (
                <ToolActivity key={item.id} group={item} active={active} />
              ),
            )}
          </li>
        ))}
        {!steps.length ? <li className="text-xs text-[var(--text-secondary)]">正在准备创作…</li> : null}
      </ol>
    </details>
  );
}

function ToolActivity({ group, active }: { group: ToolActivityGroup; active: boolean }) {
  const item = group.tools[0];
  const title =
    item.name === "read" && item.skillName
      ? `读取技能：${skillDisplayName(item.skillName)}`
      : ({
          read: "读取技能资料",
          request_user_input: "需求确认",
          text_to_image: "图像生成",
          image_to_image: "图像生成",
          inspect_image: "查看参考图片",
        }[item.name] ?? item.name);
  const progress = toolActivityProgress(group);
  const running = active && group.tools.some((tool) => tool.status === "RUNNING");
  return (
    <div aria-busy={running} className="flex items-start gap-2 py-0.5 text-xs leading-5 text-[var(--text-secondary)]">
      <Wrench aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span className={cn("min-w-0 break-words", running && styles.shimmer)}>
        {title}
        {progress}
      </span>
    </div>
  );
}
