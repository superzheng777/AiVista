"use client";

import { ChevronDown, LoaderCircle, Wrench } from "lucide-react";
import { useState } from "react";
import type { SessionItem } from "@/entities/generation/model/session";
import {
  processActivities,
  skillDisplayName,
  toolActivitySummary,
  type ToolActivityGroup,
} from "../model/agent-activity-presentation";

export function AgentProcess({ items, active }: { items: SessionItem[]; active: boolean }) {
  const [open, setOpen] = useState(active);
  const activities = processActivities(items);
  if (!activities.length && !active) return null;
  return (
    <details
      aria-label="AI 思考过程"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group mt-3 rounded-[7px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-[var(--text-secondary)]">
        <span className="flex items-center gap-2">
          {active ? <LoaderCircle className="size-3.5 animate-spin" /> : null}AI 思考过程
        </span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <ol aria-label="创作步骤" className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
        {activities.map((item) => (
          <li key={item.id}>
            {item.kind === "text" ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-7">{item.text}</p>
            ) : (
              <ToolActivity group={item} />
            )}
          </li>
        ))}
        {!activities.length ? <li className="text-xs text-[var(--text-secondary)]">正在准备创作…</li> : null}
      </ol>
    </details>
  );
}

function ToolActivity({ group }: { group: ToolActivityGroup }) {
  const item = group.tools[0];
  const title =
    item.name === "read" && item.skillName
      ? `读取技能：${skillDisplayName(item.skillName)}`
      : ({
          read: "读取技能资料",
          request_user_input: "请求用户确认",
          text_to_image: "文生图",
          image_to_image: "图生图",
          inspect_image: "查看参考图片",
        }[item.name] ?? item.name);
  const { progress, status } = toolActivitySummary(group);
  return (
    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-bg)] px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <Wrench className="size-3.5 shrink-0" />
        <span className="flex-1">
          {title}
          {progress}
        </span>
        <span>{status}</span>
      </div>
    </div>
  );
}
