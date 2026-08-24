"use client";

import type { GenerationAsset } from "@/entities/generation/model/generation";

import { PublicImageDetail } from "./public-image-detail";

export function PublicImageDetailOverlay({ image, onClose, onImageChange }: { image: GenerationAsset; onClose: () => void; onImageChange: (image: GenerationAsset) => void }) {
  return <div className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6" onClick={onClose}>
    <div className="mx-auto flex h-full max-w-6xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
      <PublicImageDetail image={image} onClose={onClose} onImageChange={onImageChange} />
    </div>
  </div>;
}
