"use client";
/* eslint-disable @next/next/no-img-element */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Trash2 } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { ImageDetailShell } from "@/entities/generation/ui/image-detail-shell";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import { getInspiration, inspirationQueryKeys, setImageLike } from "@/features/inspiration/api/inspiration-api";
import { updateInspirationInFeeds } from "@/features/inspiration/model/inspiration-cache";
import { publicationQueryKeys, removePublication } from "@/features/publication/api/publication-api";
import { getPublicAuthor, setFollowing, type PublicAuthor } from "@/features/public-user/api/public-user-api";

export function PublicImageDetail({ image, onClose, onImageChange }: { image: GenerationAsset; onClose: () => void; onImageChange: (image: GenerationAsset) => void }) {
  const { status, user } = useSession(); const { open } = useAuthDialog(); const queryClient = useQueryClient();
  const [likeError, setLikeError] = useState(false);
  const isSelf = user?.id === image.authorId;
  const author = useQuery({ queryKey: ["public-author", image.authorId], queryFn: () => getPublicAuthor(image.authorId), enabled: Boolean(image.authorId) });
  const like = useMutation({ mutationFn: (liked: boolean) => setImageLike(image.id, image.publicationVersion, liked) });
  const follow = useMutation({ mutationFn: (following: boolean) => setFollowing(image.authorId, following), onSuccess: () => { void author.refetch(); void queryClient.invalidateQueries({ queryKey: inspirationQueryKeys.following }); } });
  const withdraw = useMutation({ mutationFn: () => removePublication(image.id), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: inspirationQueryKeys.all }); void queryClient.invalidateQueries({ queryKey: publicationQueryKeys.mine }); onClose(); } });
  async function refreshImage(imageId: string): Promise<GenerationAsset> {
    const refreshed = await getInspiration(imageId);
    onImageChange(refreshed);
    updateInspirationInFeeds(queryClient, refreshed);
    return refreshed;
  }
  const requireLogin = (action: () => void) => { if (status !== "authenticated") open(); else action(); };
  function toggleLike(): void { const previous = image; const liked = !previous.likedByCurrentUser; const next = { ...previous, likedByCurrentUser: liked, likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1)) }; setLikeError(false); onImageChange(next); updateInspirationInFeeds(queryClient, next); like.mutate(liked, { onError: () => { onImageChange(previous); setLikeError(true); updateInspirationInFeeds(queryClient, previous); } }); }
  return <ImageDetailShell image={image} refreshImage={refreshImage} onClose={onClose} timeLabel="发布时间" timeValue={image.publicAt} author={<AuthorCard author={author.data} loading={author.isLoading} isSelf={isSelf} following={follow.isPending} onFollow={() => requireLogin(() => follow.mutate(!(author.data?.viewerFollowing ?? false)))} />} actions={<section><p className="text-xs font-medium tracking-wide text-muted-foreground">公开互动</p>{likeError ? <p role="status" className="mt-2 text-xs text-destructive">点赞状态更新失败，已恢复原状态。</p> : null}<button type="button" disabled={like.isPending} onClick={() => requireLogin(toggleLike)} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"><Heart className={`size-4 ${image.likedByCurrentUser ? "fill-rose-500 text-rose-500" : ""}`} />{image.likedByCurrentUser ? "取消点赞" : "点赞"} · {image.likeCount}</button>{isSelf ? <button type="button" disabled={withdraw.isPending} onClick={() => withdraw.mutate()} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"><Trash2 className="size-4" />撤销发布</button> : null}</section>} />;
}

export function AuthorCard({ author, loading, isSelf, onFollow, following }: { author: PublicAuthor | undefined; loading: boolean; isSelf: boolean; onFollow: () => void; following: boolean }) { if (loading) return <div className="h-16 animate-pulse rounded-xl bg-muted" />; if (!author) return null; const label = author.viewerFollowing ? (author.viewerFollowedByAuthor ? "互相关注" : "已关注") : (author.viewerFollowedByAuthor ? "回关" : "关注"); const profileHref = `/users?userId=${encodeURIComponent(author.id)}`; return <section className="border-b border-border pb-5"><p className="text-xs font-medium tracking-wide text-muted-foreground">作者</p><div className="mt-3 flex items-center gap-3"><Link href={profileHref} aria-label={`${author.nickname}的主页`} className="grid size-10 place-items-center overflow-hidden rounded-full bg-sky-100 text-sm font-semibold text-sky-700">{author.avatarUrl ? <img src={author.avatarUrl} alt={`${author.nickname}的头像`} className="size-full object-cover" /> : author.nickname.slice(0, 1)}</Link><div className="min-w-0 flex-1"><Link href={profileHref} className="block truncate text-sm font-semibold hover:underline">{author.nickname}</Link><p className="mt-0.5 text-xs text-muted-foreground">{author.followerCount} 位关注者 · 获赞 {author.receivedLikeCount}</p></div>{!isSelf ? <button type="button" onClick={onFollow} disabled={following} className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">{label}</button> : null}</div>{author.bio ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{author.bio}</p> : null}</section>; }
