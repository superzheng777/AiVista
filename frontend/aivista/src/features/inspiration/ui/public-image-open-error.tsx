"use client";

export function PublicImageOpenError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm shadow-lg" role="status">
    <span>{message}</span>
    <button className="text-muted-foreground hover:text-foreground" onClick={onDismiss} type="button">关闭</button>
  </div>;
}
