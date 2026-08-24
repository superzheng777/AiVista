"use client";
/* eslint-disable @next/next/no-img-element */

import { Check, Heart, LogOut, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { type GenerationAsset } from "@/entities/generation/model/generation";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import { LogoutConfirmDialog } from "@/features/auth/ui/logout-confirm-dialog";
import { PublicationsWorkspace } from "@/features/publication/ui/publications-workspace";
import { PublicImageDetailOverlay } from "@/features/inspiration/ui/public-image-detail-overlay";
import { PublicImageOpenError } from "@/features/inspiration/ui/public-image-open-error";
import { usePublicImageDetail } from "@/features/inspiration/model/use-public-image-detail";
import {
  getPublicAuthor,
  listPublications,
  listLikedPublications,
  setFollowing,
  setLikedPublicationsVisibility,
} from "@/features/public-user/api/public-user-api";

export function PublicUserPage({ userId }: { userId: string }) {
  const router = useRouter();
  const { status, user, logout, updateProfile } = useSession();
  const { open } = useAuthDialog();
  const isSelf = user?.id === userId;
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [saveError, setSaveError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const detail = usePublicImageDetail();
  const profile = useQuery({ queryKey: ["public-author", userId], queryFn: () => getPublicAuthor(userId) });
  const works = useQuery({ queryKey: ["publications", userId], queryFn: () => listPublications(userId) });
  const likes = useQuery({
    queryKey: ["liked-publications", userId],
    queryFn: () => listLikedPublications(userId, Boolean(isSelf)),
    enabled: Boolean(isSelf || profile.data?.likesPublic),
  });
  const follow = useMutation({ mutationFn: (following: boolean) => setFollowing(userId, following), onSuccess: () => void profile.refetch() });
  const visibility = useMutation({ mutationFn: setLikedPublicationsVisibility, onSuccess: () => void profile.refetch() });
  const save = useMutation({
    mutationFn: () => updateProfile({ nickname: nickname.trim(), bio: bio.trim() || null, avatarUrl: user?.avatarUrl ?? null }),
    onSuccess: () => { setEditing(false); void profile.refetch(); },
    onError: (error) => setSaveError(error instanceof Error ? error.message : "保存失败，请稍后重试。"),
  });

  function startEditing() {
    if (!user) return;
    setNickname(user.nickname);
    setBio(user.bio ?? "");
    setSaveError("");
    setEditing(true);
  }
  function cancelEditing() { setEditing(false); setSaveError(""); }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (nickname.trim()) save.mutate(); }
  async function confirmLogout() { await logout(); router.replace("/"); }
  if (profile.isLoading) return <main className="p-10 text-sm text-muted-foreground">加载作者资料中…</main>;
  if (profile.isError || !profile.data) return <main className="p-10 text-sm text-destructive">作者不存在或暂时不可用。</main>;

  const author = profile.data;
  const followLabel = author.viewerFollowing ? (author.viewerFollowedByAuthor ? "互相关注" : "已关注") : (author.viewerFollowedByAuthor ? "回关" : "关注");
  return <main className="mx-auto max-w-6xl px-6 py-9">
    <section className="rounded-3xl border bg-card p-7">
      <div className="flex items-start gap-5">
        <div className="grid size-16 place-items-center overflow-hidden rounded-full bg-sky-100 text-xl font-semibold text-sky-700">
          {author.avatarUrl ? <img src={author.avatarUrl} alt={`${author.nickname}的头像`} className="size-full object-cover" /> : author.nickname.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-semibold">{author.nickname}</h1><p className="mt-2 text-sm text-muted-foreground">{author.followerCount} 关注者 · 正在关注 {author.followingCount} · 获赞 {author.receivedLikeCount}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{author.bio || "这个作者还没有简介。"}</p></div>
        {!isSelf ? <button type="button" onClick={() => { if (status !== "authenticated") open(); else follow.mutate(!author.viewerFollowing); }} disabled={follow.isPending} className="h-10 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">{followLabel}</button> : null}
      </div>
      {isSelf ? <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5">
        <label className="flex items-center gap-3 text-sm"><span>公开我的点赞列表</span><input aria-label="公开我的点赞列表" type="checkbox" checked={author.likesPublic} disabled={visibility.isPending} onChange={(event) => visibility.mutate(event.target.checked)} /></label>
        <div className="flex gap-2"><button type="button" onClick={startEditing} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted"><Pencil className="size-3.5" />编辑资料</button><button type="button" onClick={() => setLogoutOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm text-muted-foreground hover:bg-muted"><LogOut className="size-3.5" />退出登录</button></div>
      </div> : null}
      {isSelf && editing ? <form className="mt-5 space-y-3 border-t pt-5" onSubmit={submit}><input aria-label="昵称" value={nickname} onChange={(event) => setNickname(event.target.value)} required minLength={1} maxLength={32} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" /><textarea aria-label="个人简介" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} rows={4} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />{saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}<div className="flex justify-end gap-2"><button type="button" onClick={cancelEditing} disabled={save.isPending} className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm"><X className="size-3.5" />取消</button><button type="submit" disabled={save.isPending} className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"><Check className="size-3.5" />保存</button></div></form> : null}
    </section>
    <Section title="作品" loading={works.isLoading} images={works.data ?? []} onOpen={detail.open} />
    {(isSelf || author.likesPublic) ? <Section title="点赞" loading={likes.isLoading} images={likes.data ?? []} onOpen={detail.open} /> : null}
    {isSelf ? <section className="mt-8 overflow-hidden rounded-3xl border bg-card"><PublicationsWorkspace /></section> : null}
    <LogoutConfirmDialog isOpen={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={confirmLogout} />
    {detail.image ? <PublicImageDetailOverlay image={detail.image} onClose={detail.close} onImageChange={detail.updateImage} /> : null}
    {detail.openError ? <PublicImageOpenError message={detail.openError} onDismiss={detail.dismissOpenError} /> : null}
  </main>;
}

function Section({ title, images, loading, onOpen }: { title: string; images: GenerationAsset[]; loading: boolean; onOpen: (image: GenerationAsset) => void | Promise<void> }) {
  return <section className="mt-8"><h2 className="text-lg font-semibold">{title}</h2>{loading ? <p className="mt-3 text-sm text-muted-foreground">加载中…</p> : !images.length ? <p className="mt-3 text-sm text-muted-foreground">暂无{title}。</p> : <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">{images.map((image) => <Link key={image.id} href={`/inspirations?imageId=${encodeURIComponent(image.id)}`} prefetch={false} onClick={(event) => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); void onOpen(image); }} className="overflow-hidden rounded-2xl border bg-card text-left hover:shadow-md"><img src={image.url} alt={image.title ?? title} loading="lazy" decoding="async" className="aspect-square w-full object-cover" /><div className="flex justify-between gap-2 p-3 text-sm"><span className="truncate">{image.title ?? "未命名作品"}</span><span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Heart className="size-3" />{image.likeCount}</span></div></Link>)}</div>}</section>;
}
