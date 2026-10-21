import { registerFauxProvider } from "@earendil-works/pi-ai/compat";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AgentModelBinding } from "../../src/agent/providers/bailian.js";

export async function createFauxBinding(): Promise<{
  binding: AgentModelBinding;
  faux: ReturnType<typeof registerFauxProvider>;
}> {
  const faux = registerFauxProvider();
  const model = faux.getModel();
  const modelRuntime = await ModelRuntime.create({ modelsPath: null, allowModelNetwork: false });
  modelRuntime.registerProvider(model.provider, {
    baseUrl: model.baseUrl,
    apiKey: "faux-key",
    api: faux.api,
    models: [model],
  });
  const registered = modelRuntime.getModel(model.provider, model.id);
  if (!registered) throw new Error("Faux model registration failed");
  return { binding: { modelRuntime, model: registered, thinkingLevel: "off" }, faux };
}
