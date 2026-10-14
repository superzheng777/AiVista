"use client";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { patchResource, removeResources } from "@/entities/image-resource/model/resource-cache";
import { publicResourceQueryKeys } from "@/entities/image-resource/model/resource-queries";
import { useImageDetailNavigation } from "@/entities/image-resource/model/use-image-detail-navigation";
import { getGenerationAsset } from "@/features/assets/api/asset-api";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { LogoutConfirmDialog } from "@/features/auth/ui/logout-confirm-dialog";
import { inspirationQueryKeys } from "@/features/inspiration/api/inspiration-api";
import { updateInspirationInFeeds } from "@/features/inspiration/model/inspiration-cache";
import { usePublicImageDetail } from "@/features/inspiration/model/use-public-image-detail";
import { PublicImageDetailOverlay } from "@/features/inspiration/ui/public-image-detail-overlay";
import { PublicImageOpenError } from "@/features/inspiration/ui/public-image-open-error";
import {
  getPublicAuthor,
  listLikedPublications,
  listPublications,
  setFollowing,
  setLikedPublicationsVisibility,
} from "@/features/public-user/api/public-user-api";
import { type ProfileFormValues } from "@/features/public-user/model/profile-form";
import {
  listMyPublications,
  publicationQueryKeys,
  removePublication,
} from "@/features/publication/api/publication-api";
import { personalResourceListPolicy, publicResourceListPolicy } from "@/shared/api/resource-list-policy";
import { cn } from "@/shared/lib/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PendingWorkDetail, RemovePendingDialog } from "./pending-work-detail";
import { LikesPanel, WorksPanel } from "./profile-content-panels";
import { ProfileHero } from "./profile-hero";

type ProfileView = "works" | "likes";

export function UserProfilePage({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const openAuthDialog = useAuthDialogStore((state) => state.open);
  const isSelf = user?.id === userId;
  const [activeView, setActiveView] = useState<ProfileView>("works");
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [pendingDetailId, setPendingDetailId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GenerationAsset | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const profile = useQuery({ queryKey: ["public-author", userId], queryFn: () => getPublicAuthor(userId) });
  const ownWorks = useQuery({
    ...personalResourceListPolicy,
    queryKey: publicationQueryKeys.mine,
    queryFn: listMyPublications,
    enabled: Boolean(isSelf && activeView === "works"),
  });
  const publicWorks = useQuery({
    ...publicResourceListPolicy,
    queryKey: publicResourceQueryKeys.publications(userId),
    queryFn: () => listPublications(userId),
    enabled: Boolean(!isSelf && activeView === "works"),
  });
  const canViewLikes = Boolean(isSelf || profile.data?.likesPublic);
  const likes = useQuery({
    ...(isSelf ? personalResourceListPolicy : publicResourceListPolicy),
    queryKey: publicResourceQueryKeys.likedPublications(userId, isSelf ? "self" : "public"),
    queryFn: () => listLikedPublications(userId, Boolean(isSelf)),
    enabled: Boolean(activeView === "likes" && canViewLikes),
  });
  const follow = useMutation({
    mutationFn: (following: boolean) => setFollowing(userId, following),
    onSuccess: () => {
      void profile.refetch();
      // Disabled automatic refetches mean inactive following feeds need refreshing too.
      void queryClient.invalidateQueries({ queryKey: inspirationQueryKeys.following, refetchType: "all" });
    },
  });
  const visibility = useMutation({
    mutationFn: setLikedPublicationsVisibility,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: publicResourceQueryKeys.likedPublications(userId, "public"), exact: true });
      void profile.refetch();
    },
  });
  const save = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      updateProfile({
        nickname: values.nickname.trim(),
        bio: values.bio.trim() || null,
        avatarUrl: user?.avatarUrl ?? null,
      }),
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
      queryClient
        .getQueryCache()
        .find({ queryKey: publicationQueryKeys.mine, exact: true })
        ?.setState({
          data: previous?.filter((asset) => asset.id !== imageId),
        });
      return { previous };
    },
    onSuccess: (_result, imageId) => {
      removeResources(queryClient, [imageId], true);
      setPendingDetailId(null);
      setRemoveTarget(null);
      setNotice("已取消审核");
    },
    onError: (_error, _imageId, context) => {
      if (context?.previous)
        queryClient
          .getQueryCache()
          .find({ queryKey: publicationQueryKeys.mine, exact: true })
          ?.setState({ data: context.previous });
      setRemoveTarget(null);
      setNotice("操作失败，请重试。");
    },
  });

  const worksQuery = isSelf ? ownWorks : publicWorks;
  const works = worksQuery.data ?? [];
  const pendingDetail = ownWorks.data?.find((asset) => asset.id === pendingDetailId) ?? null;

  function startEditing() {
    if (!user) return;
    setSaveError("");
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setSaveError("");
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
    patchResource(queryClient, refreshed.id, { imageUrls: refreshed.imageUrls });
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

  const publicDetailItems =
    activeView === "likes" ? (likes.data ?? []) : works.filter((asset) => asset.publicationReviewStatus === "APPROVED");
  const detailSourceQueryKey =
    activeView === "likes"
      ? publicResourceQueryKeys.likedPublications(userId, isSelf ? "self" : "public")
      : isSelf
        ? publicationQueryKeys.mine
        : publicResourceQueryKeys.publications(userId);
  const detail = usePublicImageDetail(detailSourceQueryKey, publicDetailItems, (image) => {
    updateInspirationInFeeds(queryClient, image);
  });
  const pendingDetailItems =
    activeView === "works" ? works.filter((asset) => asset.publicationReviewStatus !== "APPROVED") : [];
  const publicDetailNavigation = useImageDetailNavigation({
    items: publicDetailItems,
    currentImageId: detail.imageId,
    onSelect: detail.navigate,
  });
  const pendingDetailNavigation = useImageDetailNavigation({
    items: pendingDetailItems,
    currentImageId: pendingDetail?.id ?? null,
    onSelect: openWork,
  });

  if (profile.isLoading)
    return (
      <main className="min-h-screen bg-[var(--page-bg)] p-10 text-sm text-[var(--text-secondary)]">
        加载作者资料中…
      </main>
    );
  if (profile.isError || !profile.data)
    return (
      <main className="min-h-screen bg-[var(--page-bg)] p-10 text-sm text-[var(--accent)]">
        作者不存在或暂时不可用。
      </main>
    );

  const author = profile.data;
  const followLabel = author.viewerFollowing
    ? author.viewerFollowedByAuthor
      ? "互相关注"
      : "已关注"
    : author.viewerFollowedByAuthor
      ? "回关"
      : "关注";

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-5 text-[var(--primary)] sm:px-8 sm:py-8 lg:px-12">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <ProfileHero
          author={author}
          isSelf={Boolean(isSelf)}
          editing={editing}
          initialNickname={user?.nickname ?? ""}
          initialBio={user?.bio ?? ""}
          saveError={saveError}
          isSaving={save.isPending}
          isFollowing={follow.isPending}
          followLabel={followLabel}
          likesPublic={author.likesPublic}
          isUpdatingVisibility={visibility.isPending}
          onFollow={() => {
            if (status === "authenticated") follow.mutate(!author.viewerFollowing);
            else openAuthDialog();
          }}
          onStartEditing={startEditing}
          onCancelEditing={cancelEditing}
          onSave={(values) => save.mutate(values)}
          onLogout={() => setLogoutOpen(true)}
          onVisibilityChange={(publicVisible) => visibility.mutate(publicVisible)}
        />

        <section className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-bg)] px-5 shadow-[0_1px_2px_rgb(43_35_25_/_4%)] sm:px-10">
          <div role="tablist" aria-label="个人主页内容" className="flex h-16 items-stretch gap-10">
            <ProfileTab active={activeView === "works"} id="profile-works-tab" onClick={() => setActiveView("works")}>
              作品
            </ProfileTab>
            {canViewLikes ? (
              <ProfileTab active={activeView === "likes"} id="profile-likes-tab" onClick={() => setActiveView("likes")}>
                点赞
              </ProfileTab>
            ) : null}
          </div>
          <button
            type="button"
            onClick={startCreating}
            className="inline-flex h-[42px] items-center gap-2 rounded-[7px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--surface-bg)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            <Sparkles className="size-4" />
            开始创作
          </button>
        </section>

        {notice ? (
          <div
            role="status"
            className="flex items-center justify-between rounded-[7px] border border-[var(--border)] bg-[var(--surface-bg)] px-4 py-3 text-sm text-[var(--text-secondary)]"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--page-bg)]"
              aria-label="关闭提示"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        <section
          id="profile-content-panel"
          role="tabpanel"
          aria-labelledby={activeView === "works" ? "profile-works-tab" : "profile-likes-tab"}
          className="flex min-h-[400px] flex-col"
        >
          {activeView === "works" ? (
            <WorksPanel
              isSelf={Boolean(isSelf)}
              images={works}
              loading={worksQuery.isLoading}
              error={worksQuery.isError}
              openingId={openingId}
              onOpen={openWork}
              onRetry={() => void worksQuery.refetch()}
              onStartCreating={startCreating}
            />
          ) : (
            <LikesPanel
              images={likes.data ?? []}
              loading={likes.isLoading}
              error={likes.isError}
              onOpen={detail.open}
              onRetry={() => void likes.refetch()}
            />
          )}
          <ArchiveFooter />
        </section>
      </div>

      <LogoutConfirmDialog isOpen={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={confirmLogout} />
      {pendingDetail ? (
        <PendingWorkDetail
          asset={pendingDetail}
          navigation={pendingDetailNavigation}
          isDeleting={removePublicationMutation.isPending}
          onClose={() => setPendingDetailId(null)}
          onDelete={() => setRemoveTarget(pendingDetail)}
          refreshImage={refreshPendingImage}
        />
      ) : null}
      {removeTarget ? (
        <RemovePendingDialog
          isDeleting={removePublicationMutation.isPending}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => removePublicationMutation.mutate(removeTarget.id)}
        />
      ) : null}
      {detail.image ? (
        <PublicImageDetailOverlay
          sourceQueryKey={detail.sourceQueryKey}
          image={detail.image}
          onClose={detail.close}
          onImageChange={detail.updateImage}
          navigation={publicDetailNavigation}
        />
      ) : null}
      {detail.openError ? (
        <PublicImageOpenError message={detail.openError} onDismiss={detail.dismissOpenError} />
      ) : null}
    </main>
  );
}

function ProfileTab({
  active,
  id,
  onClick,
  children,
}: {
  active: boolean;
  id: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls="profile-content-panel"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "border-b-2 px-1 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        active
          ? "border-[var(--primary)] font-semibold text-[var(--primary)]"
          : "border-transparent text-[var(--text-secondary)] hover:text-[var(--primary)]",
      )}
    >
      {children}
    </button>
  );
}

function ArchiveFooter() {
  return (
    <div aria-hidden className="mt-auto flex items-center gap-3 pb-8 pt-8">
      <span className="size-2 shrink-0 bg-[var(--text-secondary)]" />
      <span className="h-px flex-1 bg-[var(--border-strong)]" />
      <span className="hidden shrink-0 whitespace-nowrap text-[10px] tracking-[0.18em] text-[var(--text-secondary)] sm:block">
        YOUR CREATIVE ARCHIVE STARTS HERE
      </span>
      <span className="size-2 shrink-0 bg-[var(--accent)]" />
    </div>
  );
}
