"use client";

import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { type ImageDetailNavigation } from "@/entities/image-resource/model/use-image-detail-navigation";
import { ImageDetailShell } from "@/entities/image-resource/ui/image-detail-shell";
import { OwnedImageDetailActions } from "@/entities/image-resource/ui/owned-image-detail-actions";
import { downloadOriginalGenerationImage } from "../lib/original-image-download";

export function AssetDetail({
  asset,
  refreshImage,
  navigation,
  onPublish,
  onClose,
  onDelete,
  isDeleting,
  isFavoriteUpdating,
  onFavorite,
  deleteDialog,
  publishDialog,
}: {
  asset: GenerationAsset;
  refreshImage?: (imageId: string) => Promise<GenerationAsset>;
  navigation?: ImageDetailNavigation;
  onPublish: () => void;
  onClose: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  isFavoriteUpdating: boolean;
  onFavorite: () => void;
  deleteDialog: React.ReactNode;
  publishDialog: React.ReactNode;
}) {
  return (
    <>
      <ImageDetailShell
        image={asset}
        refreshImage={refreshImage}
        navigation={navigation}
        onClose={onClose}
        onDownload={() => downloadOriginalGenerationImage(asset)}
        headerActions={(onCopy) => (
          <OwnedImageDetailActions
            image={asset}
            isFavoriteUpdating={isFavoriteUpdating}
            isDeleting={isDeleting}
            onFavorite={onFavorite}
            onPublish={onPublish}
            onCopy={onCopy}
            onDelete={onDelete}
          />
        )}
      />
      {deleteDialog}
      {publishDialog}
    </>
  );
}
