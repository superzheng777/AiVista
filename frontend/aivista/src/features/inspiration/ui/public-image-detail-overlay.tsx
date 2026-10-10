"use client";

import type { QueryKey } from "@tanstack/react-query";
import type { GenerationAsset } from "@/entities/generation/model/generation";
import type { ImageDetailNavigation } from "@/entities/generation/model/use-image-detail-navigation";
import { ImageDetailOverlay } from "@/entities/generation/ui/image-detail-overlay";

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
