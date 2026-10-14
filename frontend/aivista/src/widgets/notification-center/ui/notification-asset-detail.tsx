"use client";

import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import {
  deleteGenerationAssets,
  getGenerationAsset,
  setGenerationImageFavorites,
} from "@/features/assets/api/asset-api";
import { AssetDetail } from "@/features/assets/ui/asset-detail";
import { PublicationFormDialog } from "@/features/publication/ui/publication-form-dialog";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

export function MessageImage({ image, onClose }: { image: GenerationAsset; onClose: () => void }) {
  return <NotificationAssetDetail image={image} onClose={onClose} />;
}

function NotificationAssetDetail({ image, onClose }: { image: GenerationAsset; onClose: () => void }) {
  const [current, setCurrent] = useState(image);
  const [publish, setPublish] = useState(false);
  const refreshImage = async (imageId: string) => {
    const refreshed = await getGenerationAsset(imageId);
    setCurrent(refreshed);
    return refreshed;
  };
  const favorite = useMutation({
    mutationFn: (value: boolean) => setGenerationImageFavorites([current.id], value),
    onSuccess: (_result, value) => setCurrent((asset) => ({ ...asset, favorited: value })),
  });
  const remove = useMutation({ mutationFn: () => deleteGenerationAssets([current.id]), onSuccess: onClose });
  return (
    <AssetDetail
      asset={current}
      refreshImage={refreshImage}
      onClose={onClose}
      onPublish={() => setPublish(true)}
      onDelete={() => {
        if (window.confirm("删除图片？")) remove.mutate();
      }}
      isDeleting={remove.isPending}
      isFavoriteUpdating={favorite.isPending}
      onFavorite={() => favorite.mutate(!current.favorited)}
      deleteDialog={null}
      publishDialog={
        publish ? (
          <PublicationFormDialog
            asset={current}
            onClose={() => setPublish(false)}
            onSuccess={(result) => {
              setPublish(false);
              setCurrent((asset) => ({ ...asset, publicationReviewStatus: result.status }));
            }}
          />
        ) : null
      }
    />
  );
}
