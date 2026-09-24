"use client";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import type { ImageDetailNavigation } from "@/entities/generation/model/use-image-detail-navigation";
import { ImageDetailOverlay } from "@/entities/generation/ui/image-detail-overlay";

import { PublicImageDetail } from "./public-image-detail";

export function PublicImageDetailOverlay({
  image,
  onClose,
  onImageChange,
  navigation,
}: {
  image: GenerationAsset;
  onClose: () => void;
  onImageChange: (image: GenerationAsset) => void;
  navigation?: ImageDetailNavigation;
}) {
  return (
    <ImageDetailOverlay>
      <PublicImageDetail
        key={image.id}
        image={image}
        onClose={onClose}
        onImageChange={onImageChange}
        navigation={navigation}
      />
    </ImageDetailOverlay>
  );
}
