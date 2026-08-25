"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { needsImageUrlRefresh, type GenerationAsset } from "@/entities/generation/model/generation";

import { getInspiration } from "../api/inspiration-api";

function buildPublicImagePath(imageId: string) {
  return `/inspirations?imageId=${encodeURIComponent(imageId)}`;
}

/** 一个公开列表专用的临时详情状态；不跨页面持久化。 */
export function usePublicImageDetail() {
  const [image, setImage] = useState<GenerationAsset | null>(null);
  const [openingImageId, setOpeningImageId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const pushedHistoryEntryRef = useRef(false);
  const imageRef = useRef<GenerationAsset | null>(null);

  useEffect(() => {
    imageRef.current = image;
  }, [image]);

  const close = useCallback(() => {
    setImage(null);
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
        setImage(null);
        setOpeningImageId(null);
        return;
      }

      pushedHistoryEntryRef.current = true;
      if (imageRef.current?.id === imageId) {
        setImage(imageRef.current);
        return;
      }
      setOpeningImageId(imageId);
      void getInspiration(imageId).then(setImage).catch(() => {
        pushedHistoryEntryRef.current = false;
        setOpenError("该作品已撤销或暂时不可访问。");
      }).finally(() => setOpeningImageId(null));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const open = useCallback(async (listImage: GenerationAsset) => {
    setOpenError(null);
    if (!needsImageUrlRefresh(listImage.imageUrls.display)) {
      window.history.pushState({ aivistaPublicImageDetail: true, imageId: listImage.id }, "", buildPublicImagePath(listImage.id));
      pushedHistoryEntryRef.current = true;
      setImage(listImage);
      return;
    }
    setOpeningImageId(listImage.id);
    try {
      const detail = await getInspiration(listImage.id);
      window.history.pushState({ aivistaPublicImageDetail: true, imageId: detail.id }, "", buildPublicImagePath(detail.id));
      pushedHistoryEntryRef.current = true;
      setImage(detail);
    } catch {
      setOpenError("该作品已撤销或暂时不可访问。");
    } finally {
      setOpeningImageId(null);
    }
  }, []);

  return { image, openingImageId, openError, open, close, updateImage: setImage, dismissOpenError: () => setOpenError(null) };
}
