"use client";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import type { ImageDetailNavigation } from "@/entities/generation/model/use-image-detail-navigation";

import { PublicImageDetail } from "./public-image-detail";

export function PublicImageDetailOverlay({ image, onClose, onImageChange, navigation }: { image: GenerationAsset; onClose: () => void; onImageChange: (image: GenerationAsset) => void; navigation?: ImageDetailNavigation }) {
  return <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6" onClick={onClose}>
    <div className="mx-auto flex h-full max-w-6xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
      <PublicImageDetail key={image.id} image={image} onClose={onClose} onImageChange={onImageChange} navigation={navigation} />
    </div>
  </div>;
}
