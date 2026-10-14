"use client";

import { type GenerationAsset } from "@/entities/image-resource/model/image-resource";
import { ResourceThumbnail } from "@/features/image-access/ui/resource-thumbnail";
import { ShortestLaneFeed } from "@/shared/ui/shortest-lane-feed/shortest-lane-feed";
import {
  getWorkPreviewCardHeight,
  WorkPreviewCardImage,
  WorkPreviewCardInfoBar,
  WorkPreviewCardLikes,
  WorkPreviewCardSurface,
} from "@/shared/ui/work-preview-card/work-preview-card";
import Link from "next/link";

export function WorkGrid({
  images,
  openingId,
  onOpen,
}: {
  images: GenerationAsset[];
  openingId: string | null;
  onOpen: (image: GenerationAsset) => void | Promise<void>;
}) {
  return (
    <ShortestLaneFeed
      items={images}
      getItemKey={(image) => image.id}
      getItemHeight={getWorkPreviewCardHeight}
      minLaneWidth={180}
      renderItem={(image) => <WorkCard image={image} opening={openingId === image.id} onOpen={onOpen} />}
    />
  );
}

function WorkCard({
  image,
  opening,
  onOpen,
}: {
  image: GenerationAsset;
  opening: boolean;
  onOpen: (image: GenerationAsset) => void | Promise<void>;
}) {
  const content = (
    <WorkPreviewCardSurface>
      <ImageThumbnail image={image} />
      <WorkPreviewCardInfoBar
        title={image.title ?? "未命名作品"}
        trailing={
          image.publicationReviewStatus === "APPROVED" ? <WorkPreviewCardLikes count={image.likeCount} /> : undefined
        }
      />
      {image.publicationReviewStatus === "PENDING" ? (
        <span className="absolute right-3 top-3 rounded-[6px] bg-[var(--accent)] px-2 py-1 text-xs font-medium text-[var(--surface-bg)]">
          审核中
        </span>
      ) : null}
    </WorkPreviewCardSurface>
  );
  const className =
    "group block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60";
  if (image.publicationReviewStatus !== "APPROVED")
    return (
      <button type="button" disabled={opening} onClick={() => void onOpen(image)} className={className}>
        {content}
      </button>
    );
  return (
    <Link
      href={`/inspirations?imageId=${encodeURIComponent(image.id)}`}
      prefetch={false}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        void onOpen(image);
      }}
      className={className}
    >
      {content}
    </Link>
  );
}

function ImageThumbnail({ image }: { image: GenerationAsset }) {
  return (
    <WorkPreviewCardImage image={image}>
      {image.imageUrls.thumbnail ? (
        <ResourceThumbnail
          image={image}
          access={image.publicationReviewStatus === "APPROVED" ? "public" : "private"}
          alt={image.title ?? "作品"}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="block size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 bg-[var(--skeleton-light)]" />
      )}
    </WorkPreviewCardImage>
  );
}
