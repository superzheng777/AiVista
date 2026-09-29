# AiVista 文档导航

根目录 README 提供项目介绍与快速启动；这里是设计、实现与维护文档的统一入口。运行时指令、Skill、配置样例和数据库迁移仍与代码放在一起。

| 主题 | 入口 | 事实归属 |
| --- | --- | --- |
| 文档编写与同步 | [文档规范](standards/文档规范.md) | 全项目通用规则及前端、Java 模板 |
| 前端 | [前端项目开发文档](frontend/前端项目开发文档.md) | 页面交互、客户端状态、视觉与接口消费 |
| Java Core | [后端项目开发文档](java/后端项目开发文档.md) | 业务规则、数据库、对外 API 与权威状态 |
| TypeScript AI Runtime | [AI Runtime](worker/AI-Runtime.md) | Worker、Pi Runtime、Tool 与外部 I/O |
| Agent 跨服务链路 | [Agent 模式](architecture/Agent模式.md) | Java、TS、Pi 与浏览器的协作边界 |
| 普通生成 Worker 通信 | [Generation Worker v1](architecture/generation-worker-v1.md) | Java–TS 命令、完成提交与重投规则 |

前端的模块文档和页面视觉规范分别位于 frontend/modules 与 frontend/design；Java 模块文档位于 java/modules。跨服务文档只描述协作关系，具体业务规则或线协议应链接到其权威文档，不在多处复制。

各模块文档中的 src/ 等简写路径，以其所属项目目录为基准；跨项目引用使用可点击的相对链接。

interview 目录用于本地面试资料，目前其中的文件被 Git 忽略，不属于项目技术契约。
