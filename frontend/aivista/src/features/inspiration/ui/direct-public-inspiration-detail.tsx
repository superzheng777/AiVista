"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { getInspiration } from "../api/inspiration-api";
import { PublicImageDetailOverlay } from "./public-image-detail-overlay";

function DirectDetailFallback({ message, onExit }: { message: string; onExit: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-medium">{message}</p>
      <button
        type="button"
        onClick={onExit}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        前往灵感页
      </button>
    </main>
  );
}

export function DirectPublicInspirationDetail({ imageId, onExit }: { imageId: string; onExit: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["direct-public-image", imageId],
    queryFn: () => getInspiration(imageId),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const exit = () => {
    onExit();
    router.replace("/inspirations");
  };
  if (detailQuery.isPending) return <DirectDetailFallback message="正在加载作品…" onExit={exit} />;
  if (detailQuery.isError || !detailQuery.data)
    return <DirectDetailFallback message="该作品不存在、已撤销或暂时不可访问。" onExit={exit} />;
  const handleImageChange = (image: GenerationAsset) =>
    queryClient.setQueryData(["direct-public-image", imageId], image);
  return <PublicImageDetailOverlay image={detailQuery.data} onClose={exit} onImageChange={handleImageChange} />;
}
