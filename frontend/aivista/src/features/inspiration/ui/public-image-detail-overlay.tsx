"use client";

import type { GenerationAsset } from "@/entities/image-resource/model/image-resource";
import type { ImageDetailNavigation } from "@/entities/image-resource/model/use-image-detail-navigation";
import { ImageDetailOverlay } from "@/entities/image-resource/ui/image-detail-overlay";
import type { QueryKey } from "@tanstack/react-query";
import { PublicImageDetail } from "./public-image-detail";

export function PublicImageDetailOverlay({
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
  return (
    <ImageDetailOverlay>
      <PublicImageDetail
        key={image.id}
        image={image}
        sourceQueryKey={sourceQueryKey}
        onClose={onClose}
        onImageChange={onImageChange}
        navigation={navigation}
      />
    </ImageDetailOverlay>
  );
}
