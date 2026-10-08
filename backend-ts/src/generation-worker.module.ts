import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnvironment } from "./config/environment.js";
import { DatabaseModule } from "./database/database.module.js";
import { GenerationImageUrlService } from "./generation/generation-image-url.service.js";
import { GenerationBailianClientService } from "./generation/generation-bailian-client.service.js";
import { GenerationProviderCallGateService } from "./generation/generation-provider-call-gate.service.js";
import { GenerationImageTransferService } from "./generation/generation-image-transfer.service.js";
import { AgentModelService } from "./agent/agent-model.service.js";
import { CreationRuntimeService } from "./sessions/creation-runtime.service.js";
import { CreationHttpService } from "./sessions/creation-http.service.js";
import { CreationQueueService } from "./sessions/creation-queue.service.js";
import { RuntimeEventClient } from "./sessions/runtime-event-client.js";

import { AgentObservabilityService } from "./observability/agent-observability.service.js";

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }), DatabaseModule],
  providers: [GenerationImageUrlService, GenerationBailianClientService, GenerationProviderCallGateService,
    GenerationImageTransferService, AgentModelService, RuntimeEventClient, AgentObservabilityService,
    CreationRuntimeService, CreationHttpService, CreationQueueService] })
export class GenerationWorkerModule {}
