"use client";
/* eslint-disable @next/next/no-img-element */

import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, LogOut, Pencil, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";
import { ImageDetailShell } from "@/entities/generation/ui/image-detail-shell";
import { getGenerationAsset } from "@/features/assets/api/asset-api";
import { useAuthDialog } from "@/features/auth/model/auth-dialog-provider";
import { useSession } from "@/features/auth/model/session-provider";
import { LogoutConfirmDialog } from "@/features/auth/ui/logout-confirm-dialog";
import { useGenerationEventStream } from "@/features/generation/model/generation-event-stream-provider";
import { PublicImageDetailOverlay } from "@/features/inspiration/ui/public-image-detail-overlay";
import { PublicImageOpenError } from "@/features/inspiration/ui/public-image-open-error";
import { usePublicImageDetail } from "@/features/inspiration/model/use-public-image-detail";
import { listMyPublications, publicationQueryKeys, removePublication } from "@/features/publication/api/publication-api";
import {
  getPublicAuthor,
  listLikedPublications,
  listPublications,
  setFollowing,
  setLikedPublicationsVisibility,
} from "@/features/public-user/api/public-user-api";
import { cn } from "@/lib/utils";
import { AccentSquare, DotMatrix } from "@/shared/ui/editorial-ornaments/editorial-ornaments";
import { ShortestLaneFeed } from "@/shared/ui/shortest-lane-feed/shortest-lane-feed";
import { getWorkPreviewCardHeight, WorkPreviewCardImage, WorkPreviewCardInfoBar, WorkPreviewCardLikes, WorkPreviewCardSurface } from "@/shared/ui/work-preview-card/work-preview-card";

type ProfileView = "works" | "likes";

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

export function PublicUserPage({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status, user, logout, updateProfile } = useSession();
  const { open: openAuthDialog } = useAuthDialog();
  const { publicationRefreshVersion } = useGenerationEventStream();
  const isSelf = user?.id === userId;
  const [activeView, setActiveView] = useState<ProfileView>("works");
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [saveError, setSaveError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [pendingDetailId, setPendingDetailId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GenerationAsset | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const detail = usePublicImageDetail();

  const profile = useQuery({ queryKey: ["public-author", userId], queryFn: () => getPublicAuthor(userId) });
  const ownWorks = useQuery({
    queryKey: publicationQueryKeys.mine,
    queryFn: listMyPublications,
    enabled: Boolean(isSelf && activeView === "works"),
  });
  const publicWorks = useQuery({
    queryKey: ["publications", userId],
    queryFn: () => listPublications(userId),
    enabled: Boolean(!isSelf && activeView === "works"),
  });
  const canViewLikes = Boolean(isSelf || profile.data?.likesPublic);
  const likes = useQuery({
    queryKey: ["liked-publications", userId, isSelf ? "self" : "public"],
    queryFn: () => listLikedPublications(userId, Boolean(isSelf)),
    enabled: Boolean(activeView === "likes" && canViewLikes),
  });
  const follow = useMutation({
    mutationFn: (following: boolean) => setFollowing(userId, following),
    onSuccess: () => void profile.refetch(),
  });
  const visibility = useMutation({
    mutationFn: setLikedPublicationsVisibility,
    onSuccess: () => void profile.refetch(),
  });
  const save = useMutation({
    mutationFn: () => updateProfile({ nickname: nickname.trim(), bio: bio.trim() || null, avatarUrl: user?.avatarUrl ?? null }),
    onSuccess: () => {
      setEditing(false);
      void profile.refetch();
    },
    onError: (error) => setSaveError(error instanceof Error ? error.message : "保存失败，请稍后重试。"),
  });
  const removePublicationMutation = useMutation({
    mutationFn: removePublication,
    onMutate: async (imageId) => {
      await queryClient.cancelQueries({ queryKey: publicationQueryKeys.mine });
      const previous = queryClient.getQueryData<GenerationAsset[]>(publicationQueryKeys.mine);
      queryClient.setQueryData<GenerationAsset[]>(publicationQueryKeys.mine, (current) => current?.filter((asset) => asset.id !== imageId));
      return { previous };
    },
    onSuccess: () => {
      setPendingDetailId(null);
      setRemoveTarget(null);
      setNotice("已取消审核");
    },
    onError: (_error, _imageId, context) => {
      if (context?.previous) queryClient.setQueryData(publicationQueryKeys.mine, context.previous);
      setRemoveTarget(null);
      setNotice("操作失败，请重试。");
    },
  });

  const worksQuery = isSelf ? ownWorks : publicWorks;
  const works = worksQuery.data ?? [];
  const pendingDetail = ownWorks.data?.find((asset) => asset.id === pendingDetailId) ?? null;
  const refetchOwnWorks = ownWorks.refetch;

  useEffect(() => {
    if (isSelf && activeView === "works" && publicationRefreshVersion > 0) void refetchOwnWorks();
  }, [activeView, isSelf, publicationRefreshVersion, refetchOwnWorks]);

  function startEditing() {
    if (!user) return;
    setNickname(user.nickname);
    setBio(user.bio ?? "");
    setSaveError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nickname.trim()) save.mutate();
  }

  async function confirmLogout() {
    await logout();
    router.replace("/");
  }

  function startCreating() {
    if (status === "authenticated") router.push("/generate");
    else openAuthDialog();
  }

  async function refreshPendingImage(imageId: string): Promise<GenerationAsset> {
    const refreshed = await getGenerationAsset(imageId);
    queryClient.setQueryData<GenerationAsset[]>(publicationQueryKeys.mine, (current) =>
      current?.map((asset) => asset.id === refreshed.id ? refreshed : asset));
    return refreshed;
  }

  async function openWork(asset: GenerationAsset): Promise<void> {
    if (asset.publicationReviewStatus === "APPROVED") {
      await detail.open(asset);
      return;
    }

    if (!needsImageUrlRefresh(asset.imageUrls.display)) {
      setPendingDetailId(asset.id);
      return;
    }

    setOpeningId(asset.id);
    try {
      await refreshPendingImage(asset.id);
      setPendingDetailId(asset.id);
    } catch {
      setNotice("图片访问地址刷新失败，请稍后重试。");
    } finally {
      setOpeningId(null);
    }
  }

  if (profile.isLoading) return <main className="min-h-screen bg-[#f5f0e6] p-10 text-sm text-[#716b61]">加载作者资料中…</main>;
  if (profile.isError || !profile.data) return <main className="min-h-screen bg-[#f5f0e6] p-10 text-sm text-[#c95f3f]">作者不存在或暂时不可用。</main>;

  const author = profile.data;
  const followLabel = author.viewerFollowing ? (author.viewerFollowedByAuthor ? "互相关注" : "已关注") : (author.viewerFollowedByAuthor ? "回关" : "关注");

  return <main className="min-h-screen bg-[#f5f0e6] px-4 py-5 text-[#171612] sm:px-8 sm:py-8 lg:px-12">
    <div className="mx-auto max-w-[1680px] space-y-5">
      <ProfileHero author={author} isSelf={Boolean(isSelf)} editing={editing} nickname={nickname} bio={bio} saveError={saveError} isSaving={save.isPending} isFollowing={follow.isPending} followLabel={followLabel} likesPublic={author.likesPublic} isUpdatingVisibility={visibility.isPending} onFollow={() => { if (status === "authenticated") follow.mutate(!author.viewerFollowing); else openAuthDialog(); }} onStartEditing={startEditing} onCancelEditing={cancelEditing} onNicknameChange={setNickname} onBioChange={setBio} onSave={submit} onLogout={() => setLogoutOpen(true)} onVisibilityChange={(publicVisible) => visibility.mutate(publicVisible)} />

      <section className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#d9cfbf] bg-[#fffdf7] px-5 shadow-[0_1px_2px_rgb(43_35_25_/_4%)] sm:px-10">
        <div role="tablist" aria-label="个人主页内容" className="flex h-16 items-stretch gap-10">
          <ProfileTab active={activeView === "works"} id="profile-works-tab" onClick={() => setActiveView("works")}>作品</ProfileTab>
          {canViewLikes ? <ProfileTab active={activeView === "likes"} id="profile-likes-tab" onClick={() => setActiveView("likes")}>点赞</ProfileTab> : null}
        </div>
        <button type="button" onClick={startCreating} className="inline-flex h-[42px] items-center gap-2 rounded-[7px] bg-[#c95f3f] px-5 text-sm font-semibold text-[#fffdf7] transition-colors hover:bg-[#ae4f34] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f] focus-visible:ring-offset-2"><Sparkles className="size-4" />开始创作</button>
      </section>

      {notice ? <div role="status" className="flex items-center justify-between rounded-[7px] border border-[#d9cfbf] bg-[#fffdf7] px-4 py-3 text-sm text-[#716b61]"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="rounded p-1 text-[#716b61] hover:bg-[#f5f0e6]" aria-label="关闭提示"><X className="size-4" /></button></div> : null}

      <section id="profile-content-panel" role="tabpanel" aria-labelledby={activeView === "works" ? "profile-works-tab" : "profile-likes-tab"} className="flex min-h-[400px] flex-col">
        {activeView === "works" ? <WorksPanel isSelf={Boolean(isSelf)} images={works} loading={worksQuery.isLoading} error={worksQuery.isError} openingId={openingId} onOpen={openWork} onRetry={() => void worksQuery.refetch()} onStartCreating={startCreating} /> : <LikesPanel images={likes.data ?? []} loading={likes.isLoading} error={likes.isError} onOpen={detail.open} onRetry={() => void likes.refetch()} />}
        <ArchiveFooter />
      </section>
    </div>

    <LogoutConfirmDialog isOpen={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={confirmLogout} />
    {pendingDetail ? <PendingWorkDetail asset={pendingDetail} isDeleting={removePublicationMutation.isPending} onClose={() => setPendingDetailId(null)} onDelete={() => setRemoveTarget(pendingDetail)} refreshImage={refreshPendingImage} /> : null}
    {removeTarget ? <RemovePendingDialog isDeleting={removePublicationMutation.isPending} onCancel={() => setRemoveTarget(null)} onConfirm={() => removePublicationMutation.mutate(removeTarget.id)} /> : null}
    {detail.image ? <PublicImageDetailOverlay image={detail.image} onClose={detail.close} onImageChange={detail.updateImage} /> : null}
    {detail.openError ? <PublicImageOpenError message={detail.openError} onDismiss={detail.dismissOpenError} /> : null}
  </main>;
}

type ProfileHeroProps = {
  author: Awaited<ReturnType<typeof getPublicAuthor>>;
  isSelf: boolean;
  editing: boolean;
  nickname: string;
  bio: string;
  saveError: string;
  isSaving: boolean;
  isFollowing: boolean;
  followLabel: string;
  likesPublic: boolean;
  isUpdatingVisibility: boolean;
  onFollow: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onNicknameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
  onVisibilityChange: (publicVisible: boolean) => void;
};

function ProfileHero({ author, isSelf, editing, nickname, bio, saveError, isSaving, isFollowing, followLabel, likesPublic, isUpdatingVisibility, onFollow, onStartEditing, onCancelEditing, onNicknameChange, onBioChange, onSave, onLogout, onVisibilityChange }: ProfileHeroProps) {
  return <section className="relative min-h-[320px] overflow-hidden rounded-[12px] border border-[#d9cfbf] bg-[#fffdf7] px-6 py-8 shadow-[0_1px_2px_rgb(43_35_25_/_4%),0_8px_24px_rgb(43_35_25_/_5%)] sm:px-12 sm:py-[42px]">
    <HeroDecorations />
    <div className="relative z-10 flex min-h-[254px] flex-col">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#716b61]"><span className="text-[#c95f3f]">01</span> / CREATOR PROFILE</p>
      <div className="mt-5 flex flex-1 flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="flex min-w-0 items-center gap-5 sm:gap-7">
          <Avatar author={author} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><h1 className="truncate text-3xl font-bold leading-[1.15] tracking-tight text-[#171612] sm:text-[36px]">{author.nickname}</h1><span className="inline-flex h-[30px] items-center rounded-[6px] border border-[#e4a68e] bg-[#fff3ea] px-2.5 text-sm font-medium text-[#c95f3f]"><Sparkles className="mr-1 size-3.5" />创作者</span></div>
            <p className="mt-3 max-w-xl whitespace-pre-wrap text-sm leading-6 text-[#716b61] sm:text-base">{author.bio || "这个作者还没有简介。"}</p>
            <dl className="mt-5 flex flex-wrap items-center gap-y-3 text-sm text-[#716b61]"><ProfileStat value={author.followerCount} label="关注者" /><ProfileStat value={author.followingCount} label="正在关注" /><ProfileStat value={author.receivedLikeCount} label="获赞" /></dl>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-end">
          {isSelf ? <><button type="button" onClick={onStartEditing} className="inline-flex h-[46px] items-center gap-2 rounded-[7px] bg-[#171612] px-5 text-sm font-semibold text-[#fffdf7] transition-colors hover:bg-[#302e28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171612] focus-visible:ring-offset-2"><Pencil className="size-4" />编辑资料</button><button type="button" onClick={onLogout} className="inline-flex h-[46px] items-center gap-2 rounded-[7px] border border-[#716b61] bg-[#fffdf7] px-5 text-sm font-semibold text-[#171612] transition-colors hover:bg-[#f5f0e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#716b61] focus-visible:ring-offset-2"><LogOut className="size-4" />退出登录</button></> : <button type="button" onClick={onFollow} disabled={isFollowing} className="inline-flex h-[46px] items-center rounded-[7px] bg-[#171612] px-7 text-sm font-semibold text-[#fffdf7] transition-colors hover:bg-[#302e28] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171612] focus-visible:ring-offset-2">{followLabel}</button>}
        </div>
      </div>
      {isSelf ? <label className="mt-4 flex w-fit items-center gap-2 text-xs text-[#716b61]"><input aria-label="公开我的点赞列表" type="checkbox" checked={likesPublic} disabled={isUpdatingVisibility} onChange={(event) => onVisibilityChange(event.target.checked)} className="size-4 accent-[#c95f3f]" />公开我的点赞列表</label> : null}
      {isSelf && editing ? <form className="mt-4 max-w-xl space-y-3 border-t border-[#d9cfbf] pt-4" onSubmit={onSave}><input aria-label="昵称" value={nickname} onChange={(event) => onNicknameChange(event.target.value)} required minLength={1} maxLength={32} className="h-10 w-full rounded-[7px] border border-[#bfb3a2] bg-[#fffdf7] px-3 text-sm outline-none focus:border-[#c95f3f] focus:ring-2 focus:ring-[#c95f3f]/20" /><textarea aria-label="个人简介" value={bio} onChange={(event) => onBioChange(event.target.value)} maxLength={500} rows={3} className="w-full rounded-[7px] border border-[#bfb3a2] bg-[#fffdf7] px-3 py-2 text-sm outline-none focus:border-[#c95f3f] focus:ring-2 focus:ring-[#c95f3f]/20" />{saveError ? <p className="text-sm text-[#c95f3f]">{saveError}</p> : null}<div className="flex justify-end gap-2"><button type="button" onClick={onCancelEditing} disabled={isSaving} className="h-9 rounded-[7px] border border-[#716b61] px-3 text-sm text-[#171612]">取消</button><button type="submit" disabled={isSaving} className="inline-flex h-9 items-center gap-1 rounded-[7px] bg-[#171612] px-3 text-sm text-[#fffdf7] disabled:opacity-60"><Check className="size-3.5" />保存</button></div></form> : null}
    </div>
  </section>;
}

function HeroDecorations() {
  return <><div aria-hidden className="absolute right-0 top-0 h-[58%] w-[42%] bg-[#f7e3d4]" /><div aria-hidden className="absolute bottom-0 right-0 h-[42%] w-[35%] bg-[#f1d1bd]/45" /><AccentSquare size={22} className="absolute right-6 top-4" /><DotMatrix columns={5} rows={3} dotSize={3} gap={4} color="#c95f3f" opacity={0.25} className="absolute left-12 top-4" /><div aria-hidden className="absolute inset-x-10 bottom-6 h-px bg-[#bfb3a2]" /></>;
}

function Avatar({ author }: { author: Awaited<ReturnType<typeof getPublicAuthor>> }) {
  const initial = author.nickname.trim().slice(0, 1).toUpperCase() || "我";
  return <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-full border border-[#92897d] bg-[#fffdf7] sm:size-[164px]">{author.avatarUrl ? <img src={author.avatarUrl} alt={`${author.nickname}的头像`} className="size-full object-cover" /> : <span className="grid size-14 place-items-center rounded-[7px] bg-[#c95f3f] text-2xl font-semibold text-[#fffdf7] sm:size-[62px] sm:text-[28px]">{initial}</span>}</div>;
}

function ProfileStat({ value, label }: { value: number; label: string }) {
  return <div className="flex items-center gap-2 border-l border-[#d9cfbf] pl-5 first:border-l-0 first:pl-0 sm:pr-3"><dd className="text-lg font-semibold text-[#171612]">{value}</dd><dt>{label}</dt></div>;
}

function ProfileTab({ active, id, onClick, children }: { active: boolean; id: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="tab" id={id} aria-controls="profile-content-panel" aria-selected={active} onClick={onClick} className={cn("border-b-2 px-1 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f]", active ? "border-[#171612] font-semibold text-[#171612]" : "border-transparent text-[#716b61] hover:text-[#171612]")}>{children}</button>;
}

function WorksPanel({ isSelf, images, loading, error, openingId, onOpen, onRetry, onStartCreating }: { isSelf: boolean; images: GenerationAsset[]; loading: boolean; error: boolean; openingId: string | null; onOpen: (image: GenerationAsset) => void | Promise<void>; onRetry: () => void; onStartCreating: () => void }) {
  if (loading) return <WorkGridSkeleton />;
  if (error) return <PanelError message="作品加载失败，请重试。" onRetry={onRetry} />;
  if (!images.length) return <ProfileEmptyState isSelf={isSelf} title={isSelf ? "这里还没有作品" : "这里还没有公开作品"} description={isSelf ? "把一次灵感变成你的第一件作品" : "这个创作者还没有公开作品"} onStartCreating={onStartCreating} />;
  return <WorkGrid images={images} openingId={openingId} onOpen={onOpen} />;
}

function LikesPanel({ images, loading, error, onOpen, onRetry }: { images: GenerationAsset[]; loading: boolean; error: boolean; onOpen: (image: GenerationAsset) => void | Promise<void>; onRetry: () => void }) {
  if (loading) return <WorkGridSkeleton />;
  if (error) return <PanelError message="点赞作品加载失败，请重试。" onRetry={onRetry} />;
  if (!images.length) return <ProfileEmptyState isSelf={false} title="这里还没有点赞作品" description="喜欢的作品会出现在这里" />;
  return <WorkGrid images={images} openingId={null} onOpen={onOpen} />;
}

function WorkGrid({ images, openingId, onOpen }: { images: GenerationAsset[]; openingId: string | null; onOpen: (image: GenerationAsset) => void | Promise<void> }) {
  return <ShortestLaneFeed items={images} getItemKey={(image) => image.id} getItemHeight={getWorkPreviewCardHeight} minLaneWidth={180} renderItem={(image) => <WorkCard image={image} opening={openingId === image.id} onOpen={onOpen} />} />;
}

function WorkCard({ image, opening, onOpen }: { image: GenerationAsset; opening: boolean; onOpen: (image: GenerationAsset) => void | Promise<void> }) {
  const content = <WorkPreviewCardSurface><ImageThumbnail image={image} /><WorkPreviewCardInfoBar title={image.title ?? "未命名作品"} trailing={image.publicationReviewStatus === "APPROVED" ? <WorkPreviewCardLikes count={image.likeCount} /> : undefined} />{image.publicationReviewStatus === "PENDING" ? <span className="absolute right-3 top-3 rounded-[6px] bg-[#c95f3f] px-2 py-1 text-xs font-medium text-[#fffdf7]">审核中</span> : null}</WorkPreviewCardSurface>;
  const className = "group block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c95f3f] disabled:opacity-60";
  if (image.publicationReviewStatus !== "APPROVED") return <button type="button" disabled={opening} onClick={() => void onOpen(image)} className={className}>{content}</button>;
  return <Link href={`/inspirations?imageId=${encodeURIComponent(image.id)}`} prefetch={false} onClick={(event) => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); void onOpen(image); }} className={className}>{content}</Link>;
}

function ImageThumbnail({ image }: { image: GenerationAsset }) {
  return <WorkPreviewCardImage image={image}>{image.imageUrls.thumbnail ? <img src={image.imageUrls.thumbnail.url} alt={image.title ?? "作品"} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="block size-full object-cover" /> : <span className="absolute inset-0 bg-[#f1e8db]" />}</WorkPreviewCardImage>;
}

function WorkGridSkeleton() {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-[10px] bg-[#e9dfd1]" />)}</div>;
}

function ProfileEmptyState({ isSelf, title, description, onStartCreating }: { isSelf: boolean; title: string; description: string; onStartCreating?: () => void }) {
  return <div className="flex min-h-[400px] flex-1 items-start justify-center pt-16 text-center"><div className="max-w-[440px]"><EmptyGeometry /><h2 className="mt-5 text-2xl font-bold leading-[1.25] text-[#171612] sm:text-[28px]">{title}</h2><p className="mt-3 text-[15px] leading-7 text-[#716b61]">{description}</p>{isSelf && onStartCreating ? <button type="button" onClick={onStartCreating} className="mt-6 inline-flex h-[46px] min-w-[184px] items-center justify-center gap-2 rounded-[7px] bg-[#171612] px-6 text-sm font-semibold text-[#fffdf7] transition-colors hover:bg-[#302e28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171612] focus-visible:ring-offset-2"><Sparkles className="size-4" />开始创作</button> : null}</div></div>;
}

function EmptyGeometry() {
  return <div aria-hidden className="relative mx-auto h-[86px] w-[124px]"><span className="absolute left-1 top-0 h-[54px] w-[74px] border border-[#716b61]" /><span className="absolute left-[39px] top-[18px] h-[54px] w-[74px] border border-[#716b61]" /><span className="absolute bottom-0 left-0 size-[10px] bg-[#c95f3f]" /><Sparkles className="absolute right-0 top-[-7px] size-[14px] text-[#171612]" /></div>;
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="grid min-h-[400px] place-items-center text-center"><div><p className="text-sm text-[#c95f3f]">{message}</p><button type="button" onClick={onRetry} className="mt-3 text-sm font-medium text-[#c95f3f] underline underline-offset-4">重新加载</button></div></div>;
}

function ArchiveFooter() {
  return <div aria-hidden className="mt-auto flex items-center gap-3 pb-8 pt-8"><span className="size-2 shrink-0 bg-[#716b61]" /><span className="h-px flex-1 bg-[#bfb3a2]" /><span className="hidden shrink-0 whitespace-nowrap text-[10px] tracking-[0.18em] text-[#716b61] sm:block">YOUR CREATIVE ARCHIVE STARTS HERE</span><span className="size-2 shrink-0 bg-[#c95f3f]" /></div>;
}

function PendingWorkDetail({ asset, refreshImage, isDeleting, onClose, onDelete }: { asset: GenerationAsset; refreshImage: (imageId: string) => Promise<GenerationAsset>; isDeleting: boolean; onClose: () => void; onDelete: () => void }) {
  return <ImageDetailShell image={asset} refreshImage={refreshImage} onClose={onClose} actions={<section><p className="text-xs font-medium tracking-wide text-muted-foreground">发布操作</p><div className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">作品正在等待审核</div><button type="button" onClick={onDelete} disabled={isDeleting} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"><X className="size-4" />取消审核</button><dl className="mt-5 space-y-3 border-t border-border pt-5 text-sm"><div><dt className="text-xs text-muted-foreground">提交时间</dt><dd className="mt-1 font-medium">{createdAtText(asset.createdAt)}</dd></div></dl></section>} />;
}

function RemovePendingDialog({ isDeleting, onCancel, onConfirm }: { isDeleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <Dialog.Root open modal onOpenChange={(nextOpen) => { if (!nextOpen && !isDeleting) onCancel(); }}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/35" /><Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4"><Dialog.Popup className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"><h2 className="text-lg font-semibold">取消审核？</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">作品将从个人主页移除，但原图仍会保留在资产库。</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={isDeleting} className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted">取消</button><button type="button" onClick={onConfirm} disabled={isDeleting} className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white disabled:opacity-60">{isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}确认</button></div></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}
