"use client";

import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { removeResources } from "@/entities/image-resource/model/resource-cache";
import type { ImageDetailNavigation } from "@/entities/image-resource/model/use-image-detail-navigation";
import { ImageDetailShell } from "@/entities/image-resource/ui/image-detail-shell";
import { downloadOriginalGenerationImage } from "@/features/assets/lib/original-image-download";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";
import { useAuthStore } from "@/features/auth/model/auth-store";
import { getPublicAuthor, setFollowing } from "@/features/public-user/api/public-user-api";
import { removePublication } from "@/features/publication/api/publication-api";
import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getInspiration, inspirationQueryKeys } from "../api/inspiration-api";
import { downloadPublicDisplayImage } from "../lib/public-image-download";
import { useImageLike } from "../model/use-image-like";
import { PublicDetailHeader } from "./public-detail-header";

export function PublicImageDetail({
  image,
  sourceQueryKey,
  onClose,
  onImageChange,
  navigation,
}: {
  image: GenerationAsset;
  sourceQueryKey: QueryKey;
  onClose: () => void;
  onImageChange: (image: GenerationAsset) => void;
  navigation?: ImageDetailNavigation;
}) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const open = useAuthDialogStore((state) => state.open);
  const queryClient = useQueryClient();
  const [downloadError, setDownloadError] = useState(false);
  const isSelf = user?.id === image.authorId;
  const author = useQuery({
    queryKey: ["public-author", image.authorId],
    queryFn: () => getPublicAuthor(image.authorId),
    enabled: Boolean(image.authorId),
  });
  const like = useImageLike({ image, sourceQueryKey, userId: user?.id });
  const follow = useMutation({
    mutationFn: (following: boolean) => setFollowing(image.authorId, following),
    onSuccess: () => {
      void author.refetch();
      void queryClient.invalidateQueries({ queryKey: inspirationQueryKeys.following, refetchType: "all" });
    },
  });
  const withdraw = useMutation({
    mutationFn: () => removePublication(image.id),
    onSuccess: () => {
      removeResources(queryClient, [image.id], true);
      onClose();
    },
  });

  async function refreshImage(imageId: string): Promise<GenerationAsset> {
    const refreshed = await getInspiration(imageId);
    onImageChange(refreshed);
    return refreshed;
  }

  const requireLogin = (action: () => void) => {
    if (status !== "authenticated") open();
    else action();
  };

  const download = useMutation({
    mutationFn: async () => {
      setDownloadError(false);
      if (isSelf) await downloadOriginalGenerationImage(image);
      else await downloadPublicDisplayImage(image, refreshImage);
    },
    onError: () => setDownloadError(true),
  });

  return (
    <ImageDetailShell
      image={image}
      refreshImage={refreshImage}
      onClose={onClose}
      navigation={navigation}
      showGenerationTime={false}
      author={
        <PublicDetailHeader
          image={image}
          author={author.data}
          authorLoading={author.isLoading}
          isSelf={isSelf}
          following={follow.isPending}
          liking={like.isPending}
          downloading={download.isPending}
          withdrawing={withdraw.isPending}
          likeError={like.errorMessage}
          downloadError={downloadError}
          withdrawError={withdraw.isError}
          onFollow={() => requireLogin(() => follow.mutate(!(author.data?.viewerFollowing ?? false)))}
          onLike={() => requireLogin(like.toggle)}
          onDownload={() => download.mutate()}
          onWithdraw={() => withdraw.mutate()}
        />
      }
    />
  );
}
