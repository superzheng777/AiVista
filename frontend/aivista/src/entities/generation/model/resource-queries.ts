import type { QueryKey } from "@tanstack/react-query";

// Query families and their data shapes share one definition.
const families = {
  assets: { root: "assets", shape: "list" },
  mine: { root: "publication", shape: "list" },
  publications: { root: "publications", shape: "list" },
  likes: { root: "liked-publications", shape: "list" },
  inspiration: { root: "inspirations", shape: "pages" },
  detail: { root: "public-image-detail", shape: "detail" },
  direct: { root: "direct-public-image", shape: "detail" },
} as const;

export const assetQueryKeys = { all: [families.assets.root] as const };
export const publicationQueryKeys = { mine: [families.mine.root, "mine"] as const };
export const inspirationQueryKeys = {
  all: [families.inspiration.root] as const,
  discovery: [families.inspiration.root, "discovery"] as const,
  following: [families.inspiration.root, "following"] as const,
  search: (keyword: string) => [families.inspiration.root, "search", keyword] as const,
};
export const publicResourceQueryKeys = {
  publications: (userId: string) => [families.publications.root, userId] as const,
  likes: (userId: string) => [families.likes.root, userId] as const,
  likedPublications: (userId: string, visibility: "self" | "public") =>
    [...publicResourceQueryKeys.likes(userId), visibility] as const,
  detail: (imageId: string | null) => [families.detail.root, imageId] as const,
  direct: (imageId: string) => [families.direct.root, imageId] as const,
};

export function resourceQueryShape(key: QueryKey) {
  return Object.values(families).find((family) => family.root === key[0])?.shape;
}
