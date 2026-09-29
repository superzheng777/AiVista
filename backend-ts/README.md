# AiVista TypeScript AI Runtime

这里运行 AI 与异步 I/O Worker，不向浏览器提供 API；Java Core 保留业务状态和浏览器接口。完整架构、Pi Runtime、Tool、配置与运行说明见 [AI Runtime 文档](../docs/worker/AI-Runtime.md)。

- [Agent 跨服务链路](../docs/architecture/Agent模式.md)
- [Generation Worker v1 通信约定](../docs/architecture/generation-worker-v1.md)
- [项目文档导航](../docs/README.md)

本目录安装依赖后，可运行 pnpm typecheck、pnpm test 和 pnpm build。真实 Worker 启动、环境变量与联调步骤以 AI Runtime 文档为准。
