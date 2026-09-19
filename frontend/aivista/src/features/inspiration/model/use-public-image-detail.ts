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
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    imageRef.current = image;
  }, [image]);

  const close = useCallback(() => {
    requestSequenceRef.current += 1;
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
      const requestSequence = ++requestSequenceRef.current;
      setOpeningImageId(imageId);
      void getInspiration(imageId).then((detail) => {
        if (requestSequence === requestSequenceRef.current) setImage(detail);
      }).catch(() => {
        if (requestSequence !== requestSequenceRef.current) return;
        pushedHistoryEntryRef.current = false;
        setOpenError("该作品已撤销或暂时不可访问。");
      }).finally(() => {
        if (requestSequence === requestSequenceRef.current) setOpeningImageId(null);
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const show = useCallback(async (listImage: GenerationAsset, historyMode: "push" | "replace") => {
    const requestSequence = ++requestSequenceRef.current;
    setOpenError(null);
    const commit = (detail: GenerationAsset) => {
      if (requestSequence !== requestSequenceRef.current) return;
      const state = { aivistaPublicImageDetail: true, imageId: detail.id };
      if (historyMode === "push") window.history.pushState(state, "", buildPublicImagePath(detail.id));
      else window.history.replaceState(state, "", buildPublicImagePath(detail.id));
      pushedHistoryEntryRef.current = true;
      setImage(detail);
    };
    if (!needsImageUrlRefresh(listImage.imageUrls.display)) {
      commit(listImage);
      return;
    }
    setOpeningImageId(listImage.id);
    try {
      commit(await getInspiration(listImage.id));
    } catch {
      if (requestSequence === requestSequenceRef.current) setOpenError("该作品已撤销或暂时不可访问。");
    } finally {
      if (requestSequence === requestSequenceRef.current) setOpeningImageId(null);
    }
  }, []);

  const open = useCallback((listImage: GenerationAsset) => show(listImage, "push"), [show]);
  const navigate = useCallback((listImage: GenerationAsset) => show(listImage, "replace"), [show]);
  const updateImage = useCallback((nextImage: GenerationAsset) => {
    setImage((current) => current?.id === nextImage.id ? nextImage : current);
  }, []);

  return { image, openingImageId, openError, open, navigate, close, updateImage, dismissOpenError: () => setOpenError(null) };
}
