"use client";

import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";

import { publicResourceQueryKeys } from "@/entities/generation/model/resource-queries";
import { getInspiration } from "../api/inspiration-api";
import { discardUnavailableInspiration } from "./inspiration-cache";

function buildDetailHistoryPath(imageId: string) {
  if (window.location.pathname === "/inspirations") {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("imageId", imageId);
    return `/inspirations?${searchParams.toString()}`;
  }
  return `${window.location.pathname}${window.location.search}`;
}

const detailQueryKey = publicResourceQueryKeys.detail;

/** 详情只保存选中 ID；图片来自当前列表，列表外的入口才按 ID 查询。 */
export function usePublicImageDetail(
  listQueryKey: QueryKey | null,
  items: GenerationAsset[],
  onImageChange?: (image: GenerationAsset) => void,
) {
  const queryClient = useQueryClient();
  const [imageId, setImageId] = useState<string | null>(null);
  const [openingImageId, setOpeningImageId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const pushedHistoryEntryRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const listImage = imageId ? (items.find((item) => item.id === imageId) ?? null) : null;
  const fallback = useQuery({
    queryKey: detailQueryKey(imageId),
    queryFn: () => getInspiration(imageId!),
    enabled: Boolean(imageId && !listImage),
    staleTime: 30_000,
  });
  const image = listImage ?? fallback.data ?? null;

  const close = useCallback(() => {
    requestSequenceRef.current += 1;
    setImageId(null);
    setOpeningImageId(null);
    if (pushedHistoryEntryRef.current) {
      pushedHistoryEntryRef.current = false;
      window.history.back();
    }
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const imageId = event.state?.aivistaPublicImageDetail === true ? event.state.imageId : null;
      if (!imageId) {
        if (!pushedHistoryEntryRef.current) return;
        pushedHistoryEntryRef.current = false;
        setImageId(null);
        setOpeningImageId(null);
        return;
      }

      pushedHistoryEntryRef.current = true;
      requestSequenceRef.current += 1;
      setOpenError(null);
      setImageId(imageId);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const updateImage = useCallback(
    (nextImage: GenerationAsset) => {
      if (items.some((item) => item.id === nextImage.id)) onImageChange?.(nextImage);
      else {
        queryClient.setQueryData(detailQueryKey(nextImage.id), nextImage);
        onImageChange?.(nextImage);
      }
    },
    [items, onImageChange, queryClient],
  );

  const show = useCallback(
    async (target: GenerationAsset, historyMode: "push" | "replace") => {
      const requestSequence = ++requestSequenceRef.current;
      setOpenError(null);
      const commit = () => {
        if (requestSequence !== requestSequenceRef.current) return;
        const state = { aivistaPublicImageDetail: true, imageId: target.id };
        if (historyMode === "push") window.history.pushState(state, "", buildDetailHistoryPath(target.id));
        else window.history.replaceState(state, "", buildDetailHistoryPath(target.id));
        pushedHistoryEntryRef.current = true;
        setImageId(target.id);
      };
      if (!needsImageUrlRefresh(target.imageUrls.display)) {
        if (!items.some((item) => item.id === target.id)) queryClient.setQueryData(detailQueryKey(target.id), target);
        commit();
        return;
      }
      setOpeningImageId(target.id);
      try {
        const refreshed = await getInspiration(target.id);
        if (requestSequence !== requestSequenceRef.current) return;
        updateImage(refreshed);
        commit();
      } catch (error) {
        discardUnavailableInspiration(queryClient, target.id, error);
        if (requestSequence === requestSequenceRef.current) setOpenError("该作品已撤销或暂时不可访问。");
      } finally {
        if (requestSequence === requestSequenceRef.current) setOpeningImageId(null);
      }
    },
    [items, queryClient, updateImage],
  );

  const open = useCallback((listImage: GenerationAsset) => show(listImage, "push"), [show]);
  const navigate = useCallback((listImage: GenerationAsset) => show(listImage, "replace"), [show]);
  return {
    image,
    sourceQueryKey: listImage && listQueryKey ? listQueryKey : detailQueryKey(imageId),
    imageId,
    openingImageId: openingImageId ?? (imageId && !listImage && fallback.isPending ? imageId : null),
    openError: openError ?? (!listImage && fallback.isError ? "该作品已撤销或暂时不可访问。" : null),
    open,
    navigate,
    close,
    updateImage,
    dismissOpenError: () => {
      setOpenError(null);
      if (!listImage && fallback.isError) close();
    },
  };
}
