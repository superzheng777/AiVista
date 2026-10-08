# AiVista 文档导航

根目录 README 提供项目介绍与快速启动；这里是设计、实现与维护文档的统一入口。运行时指令、Skill、配置样例和数据库迁移仍与代码放在一起。

| 主题 | 入口 | 事实归属 |
| --- | --- | --- |
| 文档编写与同步 | [文档规范](standards/文档规范.md) | 全项目通用规则及前端、Java 模板 |
| 前端 | [前端项目开发文档](frontend/前端项目开发文档.md) | 页面交互、客户端状态、视觉与接口消费 |
| 资源列表缓存 | [资源列表缓存模块](frontend/modules/资源列表缓存模块.md) | 各列表策略、局部更新、事件失效、URL 复用和测试边界 |
| Java Core | [后端项目开发文档](java/后端项目开发文档.md) | 业务规则、数据库、对外 API 与权威状态 |
| 用户统计与通知去重 | [用户统计与通知去重模块](java/modules/用户统计与通知去重模块.md) | 已确认通知方案、待定统计拆表及联合改造影响 |
| TypeScript AI Runtime | [AI Runtime](worker/AI-Runtime.md) | Node 本地创作调度、Pi Runtime、图片 MQ、限速与执行结算 |
| Agent 跨服务链路 | [Agent 模式](architecture/Agent模式.md) | Java、TS、Pi 与浏览器的协作边界 |
| 创作会话通信 | [创作通信协议](architecture/creation-protocol.md) | 统一 REST/SSE、四区展示内容项、内部 HTTP 与图片 MQ 重投规则 |

前端的模块文档和页面视觉规范分别位于 frontend/modules 与 frontend/design；Java 模块文档位于 java/modules。跨服务文档只描述协作关系，具体业务规则或线协议应链接到其权威文档，不在多处复制。

各模块文档中的 src/ 等简写路径，以其所属项目目录为基准；跨项目引用使用可点击的相对链接。

interview 目录用于本地面试资料，目前其中的文件被 Git 忽略，不属于项目技术契约。
