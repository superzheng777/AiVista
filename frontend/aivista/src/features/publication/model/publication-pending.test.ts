import { beforeEach, describe, expect, it } from "vitest";

import {
  PENDING_PUBLICATION_STORAGE_PREFIX,
  clearAllPendingPublications,
  clearPendingPublication,
  createPublicationIdempotencyKey,
  readPendingPublication,
  storePendingPublication,
} from "@/features/publication/model/publication-pending";

describe("publication-pending", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("按 imageId 分槽存储与读取", () => {
    storePendingPublication({
      userId: "u1",
      imageId: "img-1",
      input: { title: "标题1", description: "描述1" },
      idempotencyKey: "key-1",
      createdAt: 100,
    });
    storePendingPublication({
      userId: "u1",
      imageId: "img-2",
      input: { title: "标题2", description: "描述2" },
      idempotencyKey: "key-2",
      createdAt: 200,
    });

    const one = readPendingPublication("img-1");
    const two = readPendingPublication("img-2");
    expect(one).toMatchObject({ imageId: "img-1", idempotencyKey: "key-1" });
    expect(two).toMatchObject({ imageId: "img-2", idempotencyKey: "key-2" });
    expect(one?.input).toEqual({ title: "标题1", description: "描述1" });
  });

  it("同一图片重复提交复用槽位,不同图片互不覆盖", () => {
    storePendingPublication({
      userId: "u1", imageId: "img-1", input: { title: "旧", description: "" },
      idempotencyKey: "key-a", createdAt: 100,
    });
    storePendingPublication({
      userId: "u1", imageId: "img-1", input: { title: "新", description: "" },
      idempotencyKey: "key-b", createdAt: 200,
    });
    storePendingPublication({
      userId: "u1", imageId: "img-2", input: { title: "另一张", description: "" },
      idempotencyKey: "key-c", createdAt: 300,
    });

    expect(readPendingPublication("img-1")).toMatchObject({ idempotencyKey: "key-b", input: { title: "新", description: "" } });
    expect(readPendingPublication("img-2")).toMatchObject({ idempotencyKey: "key-c" });
  });

  it("损坏的 JSON 返回 null", () => {
    window.sessionStorage.setItem(`${PENDING_PUBLICATION_STORAGE_PREFIX}.img-1`, "{bad json");
    expect(readPendingPublication("img-1")).toBeNull();
  });

  it("clear 移除单槽,clearAll 清除所有发布槽位", () => {
    storePendingPublication({
      userId: "u1", imageId: "img-1", input: { title: "", description: "" },
      idempotencyKey: "key-1", createdAt: 100,
    });
    storePendingPublication({
      userId: "u1", imageId: "img-2", input: { title: "", description: "" },
      idempotencyKey: "key-2", createdAt: 200,
    });
    window.sessionStorage.setItem("aivista.other-key", "保留");

    clearPendingPublication("img-1");
    expect(readPendingPublication("img-1")).toBeNull();
    expect(readPendingPublication("img-2")).not.toBeNull();

    clearAllPendingPublications();
    expect(readPendingPublication("img-2")).toBeNull();
    expect(window.sessionStorage.getItem("aivista.other-key")).toBe("保留");
  });

  it("createPublicationIdempotencyKey 每次生成不同的 UUID", () => {
    const a = createPublicationIdempotencyKey();
    const b = createPublicationIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
