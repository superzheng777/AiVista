"use client";

import { useIsMutating, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { GenerationAsset } from "@/entities/generation/model/generation";
import { cancelResourceQueries, readResource, updateMyLikes } from "@/entities/generation/model/resource-cache";
import { optimisticResourceUpdate } from "@/entities/generation/model/optimistic-resource-update";
import { setImageLike } from "../api/inspiration-api";

class ChangedPublicationError extends Error {}

type LikeRequest = {
  id: string;
  publicationVersion: number;
  liked: boolean;
  sourceQueryKey: QueryKey;
};

export function useImageLike({
  image,
  sourceQueryKey,
  userId,
}: {
  image: GenerationAsset;
  sourceQueryKey: QueryKey;
  userId?: string;
}) {
  const client = useQueryClient();
  const mutationKey = ["image-like", image.id] as const;
  const pending = useIsMutating({ mutationKey, exact: true }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: (request: LikeRequest) => setImageLike(request.id, request.publicationVersion, request.liked),
    onMutate: async (request) => {
      await cancelResourceQueries(client, [request.id]);
      const current = readResource(client, request.sourceQueryKey, request.id);
      if (!current || current.publicationVersion !== request.publicationVersion) {
        throw new ChangedPublicationError("作品信息已更新，请刷新后重试。");
      }
      const next = {
        ...current,
        likedByCurrentUser: request.liked,
        likeCount: Math.max(
          0,
          current.likeCount + (current.likedByCurrentUser === request.liked ? 0 : request.liked ? 1 : -1),
        ),
      };
      const update = optimisticResourceUpdate(
        client,
        new Map([[next.id, { likedByCurrentUser: next.likedByCurrentUser, likeCount: next.likeCount }]]),
        new Map([[next.id, request.publicationVersion]]),
      );
      return { update };
    },
    onSuccess: async (_data, request, context) => {
      const applied = await context.update.finish(true);
      const current = readResource(client, request.sourceQueryKey, request.id);
      if (applied && userId && current?.publicationVersion === request.publicationVersion) {
        updateMyLikes(client, userId, current);
      }
    },
    onError: async (_error, _request, context) => {
      await context?.update.finish(false);
    },
  });
  return {
    isPending: pending,
    errorMessage: mutation.isError
      ? mutation.error instanceof ChangedPublicationError
        ? mutation.error.message
        : "点赞状态更新失败，已恢复原状态。"
      : null,
    toggle() {
      // Capture intent before awaiting cancellation; never re-toggle from a refreshed cache.
      if (client.isMutating({ mutationKey, exact: true })) return;
      mutation.mutate({
        id: image.id,
        publicationVersion: image.publicationVersion,
        liked: !image.likedByCurrentUser,
        sourceQueryKey,
      });
    },
  };
}
