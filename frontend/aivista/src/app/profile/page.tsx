"use client";

import { Check, LogOut, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { useSession } from "@/features/auth/model/session-provider";
import { LogoutConfirmDialog } from "@/features/auth/ui/logout-confirm-dialog";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileContent />
    </AppShell>
  );
}

function ProfileContent() {
  const router = useRouter();
  const { user, logout, updateProfile } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  function cancelEditing() {
    if (user) {
      setNickname(user.nickname);
      setBio(user.bio ?? "");
    }
    setError("");
    setIsEditing(false);
  }

  function beginEditing() {
    if (!user) return;
    setNickname(user.nickname);
    setBio(user.bio ?? "");
    setError("");
    setIsEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setError("");
    setIsSaving(true);
    try {
      await updateProfile({
        nickname: nickname.trim(),
        bio: bio.trim() || null,
        avatarUrl: user.avatarUrl,
      });
      setIsEditing(false);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "保存失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) {
    return <main className="min-h-screen" aria-busy="true" aria-label="正在加载个人主页" />;
  }

  const initial = user.nickname.trim().slice(0, 1).toUpperCase() || "我";
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12 sm:py-20">
      <section className="rounded-[2rem] border border-border bg-card p-8 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.42)] sm:p-12">
          <div className="flex flex-col justify-between gap-8 border-b border-border pb-8 sm:flex-row sm:items-start">
            <div className="flex items-center gap-5">
              <div className="grid size-20 overflow-hidden rounded-full bg-sky-100 text-sky-700">
                {user.avatarUrl ? (
                  // Avatar URLs will be served by the media domain in a later iteration.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt={`${user.nickname}的头像`} className="size-full object-cover" />
                ) : <span className="grid place-items-center text-2xl font-semibold">{initial}</span>}
              </div>
              <div>
                <p className="text-2xl font-semibold">{user.nickname}</p>
                <p className="mt-1 text-sm text-muted-foreground">@{user.loginName}</p>
              </div>
            </div>
            <button type="button" onClick={() => setIsLogoutDialogOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted">
              <LogOut className="size-4" /> 退出登录
            </button>
          </div>

          {isEditing ? (
            <form className="mt-8 space-y-5" onSubmit={handleSave}>
              <label className="block">
                <span className="text-sm font-medium text-card-foreground">昵称</span>
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} required minLength={1} maxLength={32} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-card-foreground">个人简介</span>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} rows={5} className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 text-foreground outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" placeholder="写下你想让别人认识的自己" />
              </label>
              <p className="text-xs leading-5 text-muted-foreground">头像将在媒资上传能力接入后支持修改。</p>
              {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
              <div className="flex flex-wrap justify-end gap-3 pt-1">
                <button type="button" onClick={cancelEditing} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50"><X className="size-4" />取消</button>
                <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-sky-600 disabled:opacity-50"><Check className="size-4" />{isSaving ? "保存中…" : "保存修改"}</button>
              </div>
            </form>
          ) : (
            <div className="mt-8">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-medium text-card-foreground">个人简介</h2>
                <button type="button" onClick={beginEditing} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"><Pencil className="size-4" />编辑资料</button>
              </div>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-muted-foreground">{user.bio || "还没有写下个人简介。"}</p>
            </div>
          )}

          <p className="mt-12 text-sm text-muted-foreground">已发布作品、点赞和关注信息会在后续社区迭代中补充。</p>
      </section>
      <LogoutConfirmDialog isOpen={isLogoutDialogOpen} onClose={() => setIsLogoutDialogOpen(false)} onConfirm={handleLogout} />
    </main>
  );
}
