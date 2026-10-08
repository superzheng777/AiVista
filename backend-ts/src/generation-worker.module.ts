import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnvironment } from "./config/environment.js";
import { DatabaseModule } from "./database/database.module.js";
import { GenerationImageUrlService } from "./generation/generation-image-url.service.js";
import { GenerationBailianClientService } from "./generation/generation-bailian-client.service.js";
import { GenerationRateLimiterService } from "./generation/generation-rate-limiter.service.js";
import { GenerationImageTransferService } from "./generation/generation-image-transfer.service.js";
import { AgentModelService } from "./agent/agent-model.service.js";
import { CreationRuntimeService } from "./sessions/creation-runtime.service.js";
import { CreationHttpService } from "./sessions/creation-http.service.js";
import { GenerationQueueService } from "./sessions/generation-queue.service.js";
import { GenerationTaskService } from "./sessions/generation-task.service.js";
import { CreationDispatcherService } from "./sessions/creation-dispatcher.service.js";
import { RuntimeEventClient } from "./sessions/runtime-event-client.js";

import { AgentObservabilityService } from "./observability/agent-observability.service.js";

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }), DatabaseModule],
  providers: [GenerationImageUrlService, GenerationBailianClientService, GenerationRateLimiterService,
    GenerationImageTransferService, AgentModelService, RuntimeEventClient, AgentObservabilityService,
    CreationRuntimeService, CreationHttpService, CreationDispatcherService, GenerationTaskService, GenerationQueueService] })
export class GenerationWorkerModule {}
