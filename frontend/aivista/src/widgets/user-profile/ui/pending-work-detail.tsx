"use client";

import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { type ImageDetailNavigation } from "@/entities/image-resource/model/use-image-detail-navigation";
import { ImageDetailOverlay } from "@/entities/image-resource/ui/image-detail-overlay";
import { ImageDetailShell } from "@/entities/image-resource/ui/image-detail-shell";
import { downloadOriginalGenerationImage } from "@/features/assets/lib/original-image-download";
import { Dialog } from "@base-ui/react/dialog";
import { LoaderCircle, X } from "lucide-react";

function createdAtText(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function PendingWorkDetail({
  asset,
  refreshImage,
  navigation,
  isDeleting,
  onClose,
  onDelete,
}: {
  asset: GenerationAsset;
  refreshImage: (imageId: string) => Promise<GenerationAsset>;
  navigation?: ImageDetailNavigation;
  isDeleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <ImageDetailOverlay>
      <ImageDetailShell
        image={asset}
        refreshImage={refreshImage}
        navigation={navigation}
        onClose={onClose}
        onDownload={() => downloadOriginalGenerationImage(asset)}
        actions={
          <section>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">发布操作</p>
            <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
              作品正在等待审核
            </div>
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
            >
              <X className="size-4" />
              取消审核
            </button>
            <dl className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">提交时间</dt>
                <dd className="mt-1 font-medium">{createdAtText(asset.createdAt)}</dd>
              </div>
            </dl>
          </section>
        }
      />
    </ImageDetailOverlay>
  );
}

export function RemovePendingDialog({
  isDeleting,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root
      open
      modal
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isDeleting) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
          <Dialog.Popup className="w-full max-w-sm rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] p-6 shadow-[0_24px_70px_-30px_var(--shadow)]">
            <h2 className="text-lg font-semibold">取消审核？</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              作品将从个人主页移除，但原图仍会保留在资产库。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isDeleting}
                className="h-9 rounded-[7px] px-3 text-sm font-medium text-muted-foreground transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isDeleting}
                className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-destructive px-3 text-sm font-medium text-white transition hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}确认
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
