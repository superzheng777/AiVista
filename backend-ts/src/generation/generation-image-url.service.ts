import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OSS from "ali-oss";
import type { Environment } from "../config/environment.js";

@Injectable()
export class GenerationImageUrlService {
  private readonly origin: string | undefined;
  private readonly originalTtlSeconds: number;
  private readonly client: OSS | undefined;

  constructor(config: ConfigService<Environment, true>) {
    this.originalTtlSeconds = config.get("AIVISTA_OSS_ORIGINAL_SIGNED_URL_TTL_SECONDS", { infer:true });
    const endpoint = config.get("AIVISTA_OSS_ENDPOINT", { infer:true });
    const bucket = config.get("AIVISTA_OSS_BUCKET", { infer:true });
    this.origin = endpoint && bucket ? `https://${bucket}.${new URL(endpoint.includes("://") ? endpoint : `https://${endpoint}`).hostname}` : undefined;
    const accessKeyId = config.get("AIVISTA_OSS_ACCESS_KEY_ID", { infer:true });
    const accessKeySecret = config.get("AIVISTA_OSS_ACCESS_KEY_SECRET", { infer:true });
    if (endpoint && bucket && accessKeyId && accessKeySecret) {
      this.client = new OSS({ endpoint, bucket, accessKeyId, accessKeySecret, secure: true });
    }
  }

  private original(objectKey: string): string {
    if (!this.client) throw new Error("OSS signing configuration is missing");
    return this.client.signatureUrl(objectKey, { expires: this.originalTtlSeconds });
  }

  unsigned(objectKey: string): string {
    if (!this.origin || objectKey.startsWith("/") || objectKey.split("/").includes("..")) {
      throw new Error("Invalid OSS object reference");
    }
    return `${this.origin}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  }

  signReference(value: string): string {
    const url = new URL(value);
    if (url.origin !== this.origin || url.search || url.hash || url.username || url.password) {
      throw new Error("Image URL is outside the configured private bucket");
    }
    return this.original(decodeURIComponent(url.pathname.slice(1)));
  }

}
