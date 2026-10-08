import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Selectable } from "kysely";
import type { Environment } from "../config/environment.js";
import type { GenerationExecution } from "../database/database.types.js";
import { GenerationImageUrlService } from "./generation-image-url.service.js";
import { BailianProviderError, BailianTransportError } from "./generation-provider-error.js";
import type { AssetReference } from "../sessions/session-contract.js";

export interface BailianProviderResult {
  requestId: string | null;
  imageUrls: string[];
}

@Injectable()
export class GenerationBailianClientService {
  private readonly endpoint?: string;
  private readonly apiKey?: string;
  private readonly readTimeoutMs: number;

  constructor(config: ConfigService<Environment, true>,
    private readonly imageUrls: GenerationImageUrlService) {
    this.endpoint = config.get("AIVISTA_BAILIAN_ENDPOINT", { infer: true });
    this.apiKey = config.get("AIVISTA_BAILIAN_API_KEY", { infer: true });
    this.readTimeoutMs = config.get("AIVISTA_BAILIAN_READ_TIMEOUT_MS", { infer: true });
  }

  async generate(task: Selectable<GenerationExecution>, inputs: AssetReference[] = []): Promise<BailianProviderResult> {
    if (!this.endpoint || !this.apiKey) throw new Error("Bailian configuration is missing");
    const content = [...inputs.map((asset) => ({ image: this.imageUrls.signReference(asset.url) })),
      { text: task.final_prompt }];
    const request = {
      model: task.model.replace("bailian/", ""),
      input: { messages: [{ role: "user", content }] },
      parameters: { negative_prompt: task.final_negative_prompt ?? "", size: `${task.width}*${task.height}`,
        n: task.requested_image_count, prompt_extend: Boolean(task.prompt_extend), watermark: false },
    };
    let response: Response;
    try {
      response = await fetch(this.endpoint, { method: "POST", headers: { "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`, "x-dashscope-wait-timeout": "30" }, body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.readTimeoutMs) });
    } catch (error) {
      throw new BailianTransportError(error);
    }
    let body: string;
    try {
      body = await response.text();
    } catch (error) {
      throw new BailianTransportError(error);
    }
    const parsed = parseResponse(body);
    if (!response.ok) throw providerError(response.status, parsed);
    const result = resultFrom(parsed);
    if (result.imageUrls.length !== task.requested_image_count) {
      throw new BailianProviderError(200, null, result.requestId, "Bailian image URL count does not match the request");
    }
    return result;
  }

}

function parseResponse(body: string): any {
  try { return JSON.parse(body); } catch { return undefined; }
}

function providerError(status: number, value: any) {
  return value && typeof value === "object"
    ? new BailianProviderError(status, stringOrNull(value.code), stringOrNull(value.request_id ?? value.requestId), stringOrNull(value.message) ?? "Bailian error")
    : new BailianProviderError(status, null, null, "Unparseable Bailian error response");
}

function resultFrom(response: any): BailianProviderResult {
  if (!response || typeof response !== "object") throw new BailianProviderError(200, null, null, "Empty Bailian response");
  const requestId = stringOrNull(response.request_id ?? response.requestId);
  const code = stringOrNull(response.code);
  if (code) throw new BailianProviderError(200, code, requestId, stringOrNull(response.message) ?? "Bailian error");
  const choices = response.output?.choices;
  const choice = Array.isArray(choices) && choices.length === 1 ? choices[0] : undefined;
  if (!choice || choice.finish_reason !== "stop" || !Array.isArray(choice.message?.content)) {
    throw new BailianProviderError(200, null, requestId, "Unexpected Bailian success response");
  }
  const imageUrls = choice.message.content.map((entry: any) => stringOrNull(entry?.image)).filter((url: string | null): url is string => Boolean(url));
  const width = integerOrNull(response.usage?.width ?? response.usage?.output_width);
  const height = integerOrNull(response.usage?.height ?? response.usage?.output_height);
  if (imageUrls.length === 0 || width === null || height === null) {
    throw new BailianProviderError(200, null, requestId, "Invalid Bailian success usage");
  }
  return { requestId, imageUrls };
}

function stringOrNull(value: unknown) { return typeof value === "string" && value.trim() ? value : null; }
function integerOrNull(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : null; }
