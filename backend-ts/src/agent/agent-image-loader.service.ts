import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ImageContent } from "@earendil-works/pi-ai";
import OSS from "ali-oss";
import type { Environment } from "../config/environment.js";
import type { AgentExecutionSnapshot, AgentImageAssetSnapshot } from "./adapters/java-generation-client.js";

type AgentImageAsset = AgentExecutionSnapshot["inputAssets"][number] | AgentImageAssetSnapshot;

/** 从私有 OSS 读取本轮已授权图片，并转换为 Pi 官方 ImageContent。 */
@Injectable()
export class AgentImageLoaderService {
  private readonly client?: OSS;

  constructor(config: ConfigService<Environment, true>) {
    const endpoint = config.get("AIVISTA_OSS_ENDPOINT", { infer: true });
    const bucket = config.get("AIVISTA_OSS_BUCKET", { infer: true });
    const accessKeyId = config.get("AIVISTA_OSS_ACCESS_KEY_ID", { infer: true });
    const accessKeySecret = config.get("AIVISTA_OSS_ACCESS_KEY_SECRET", { infer: true });
    if (endpoint && bucket && accessKeyId && accessKeySecret) {
      this.client = new OSS({ endpoint, bucket, accessKeyId, accessKeySecret });
    }
  }

  async load(inputs: AgentExecutionSnapshot["inputAssets"], signal?: AbortSignal): Promise<ImageContent[]> {
    if (inputs.length === 0) return [];
    return Promise.all(inputs.map((input) => this.loadOne(input, signal)));
  }

  async loadOne(input: AgentImageAsset, signal?: AbortSignal): Promise<ImageContent> {
    signal?.throwIfAborted();
    if (!this.client) throw new Error("OSS configuration is missing for Agent image input");
    const url = this.client.signatureUrl(input.objectKey, { expires: 60 });
    const response = await fetch(url, signal ? { signal } : undefined);
    if (!response.ok) {
      throw new Error(`OSS returned HTTP ${response.status} for Agent input asset ${input.assetId}`);
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length === 0) {
      throw new Error(`Agent input asset ${input.assetId} has no readable content`);
    }
    signal?.throwIfAborted();
    return { type: "image", data: content.toString("base64"), mimeType: input.contentType };
  }
}
