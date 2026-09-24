import type { ReactNode } from "react";

type ImageDetailOverlayProps = { children: ReactNode };

export function ImageDetailOverlay({ children }: ImageDetailOverlayProps) {
  return (
    <div className="fixed inset-y-0 left-0 right-0 z-50 overflow-hidden bg-[var(--page-bg)] md:left-[88px]">
      {children}
    </div>
  );
}
