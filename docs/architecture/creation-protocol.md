# 创作通信协议

浏览器只访问 Java `/api`；Java 转发受保护的 TS `/internal` 接口。除 DELETE 成功返回 204 无正文外，外部响应统一为 `{code,message,data}`，成功 code 为 0。ID 均为十进制字符串，时间为 ISO 8601 UTC。

## REST 资源

| 方法与路径（省略 /api） | 请求 | 成功响应 data |
| --- | --- | --- |
| GET /generation-sessions | 无分页参数 | SessionSummary[]，当前用户未删除的全部会话 |
| GET /generation-sessions/{sessionId} | 无 | SessionDetail，完整 turns |
| PATCH /generation-sessions/{sessionId} | `{title}` | `{sessionId,title}` |
| DELETE /generation-sessions/{sessionId} | 无正文 | 204 No Content，重复删除本人已删除的会话也返回 204 |
| POST /creations | CreationRequest | 202，`{sessionId,turn}`；Location 指向 creation |
| GET /creations/{creationId} | 无 | CreationTurn |
| PUT /creations/{creationId}/forms/{toolCallId}/response | `{expectedRevision,action,values?}` | 首次 201，重复同值 200；`{changed,creationId,status,revision,item}` |
| PUT /creations/{creationId}/cancellation | `{}` | `{creationId,status,revision}` |
| GET /events | Bearer Token | 用户级 SSE |

POST 不按 requestId 去重：不同提交是不同创作。前端控制提交按钮，服务端检查同一会话活动执行和 30 轮限制。PUT 表单通过执行版本、toolCallId 和持久化字段值保证幂等。toolCallId 是不透明字符串，路径中必须 URL 编码。

DELETE 仅将 `generation_sessions.deleted_at` 设为删除时间。删除后，列表不再返回该会话，详情、改名、继续创作以及所属创作的查询、表单回答和取消接口均返回 404（code=40401）。他人的会话与不存在的会话同样返回 404；本人重复 DELETE 保持原删除时间并返回 204。未登录返回 401。

会话内任一创作或图片任务处于 QUEUED、RUNNING、WAITING_INPUT，或本地创作仍在退出时，DELETE 返回 409（code=40908），不会自动取消任务。用户需先取消创作；已经发给图片模型的任务须完成保存和结算后才能删除。删除、继续创作和改名以目标会话的 `SELECT ... FOR UPDATE` 串行化，不再预先对用户行加排他锁。新会话先普通查询确认用户存在，再插入并锁定会话；已有会话先锁会话，再检查活动执行和轮次限制。外键检查仍可能取得用户共享锁，不能把移除显式预锁理解成完全没有用户锁。

逻辑删除保留原生 Pi JSONL、执行记录、生成图片、已发布作品和额度记录，不删除 OSS 对象、不退还已经消耗的额度。Java 丢弃已删除会话的迟到创作事件。前端侧栏“…”菜单的删除按钮直接处理 204，不解析 JSON 正文；成功后取消该会话详情及列表的在途查询，移除列表项和详情缓存，清除事件缓冲及状态提示并忽略迟到事件。删除当前会话时替换路由为 `/generate`，删除其他会话不切换页面；失败保留会话并显示服务端原因或网络失败提示。

```json
{
  "sessionId": "1001",
  "mode": "AGENT",
  "input": { "prompt": "设计咖啡店海报", "assetIds": ["3001"] },
  "settings": { "aspectRatio": "3:4", "imageCount": 1 }
}
```

省略 sessionId 创建会话。NORMAL 必须给画幅和 1–6 张数量，还可设置 negativePrompt、promptExtend；AGENT 省略画幅或数量表示自动，不发送 AUTO 或 0。

## 会话响应

SessionSummary：sessionId、title、creationCount、lastMessageAt。SessionDetail 再包含 schemaVersion=1、creationLimit=30、turns。

```json
{
  "schemaVersion": 1,
  "sessionId": "1001",
  "title": "咖啡店海报",
  "creationCount": 1,
  "creationLimit": 30,
  "lastMessageAt": "2026-10-07T00:00:00Z",
  "turns": [{
    "creationId": "2001", "mode": "AGENT", "status": "WAITING_INPUT", "revision": 2,
    "input": { "prompt": "设计咖啡店海报", "assets": [] },
    "settings": { "aspectRatio": "3:4", "imageCount": 1 },
    "createdAt": "2026-10-07T00:00:00Z", "completedAt": null, "failureCode": null,
    "items": [{
      "id": "form-call-1", "kind": "form", "toolCallId": "form-call-1", "status": "PENDING",
      "schemaVersion": 2, "title": "确认标题",
      "fields": [{ "id": "headline", "type": "TEXT", "label": "海报标题", "required": true, "value": "" }]
    }]
  }]
}
```

普通与 Agent 的 generation 内容项由原生 toolResult.details 和 MySQL 图片执行记录共同组装，id 使用对应 toolCallId。数据库中的排队状态、执行状态和已结算资产合入同一条目，即使 Pi 尚未追加工具结果也能展示。SSE 使用同一 id 和字段更新卡片；历史加载不增加第二张结果卡片。

items 的四种类型：

- text：id、kind、text、phase（process/final）。稳定 ID 为 `text:{message.timestamp}:{contentIndex}`，同一文本从过程提升为最终回复时复用 ID。
- tool：id、kind、toolCallId、name、status（RUNNING/SUCCEEDED/FAILED/CANCELLED），读取 Skill 时额外提供 skillName（仅技能目录名，用于前端中文标题）。ID 为 `tool:{toolCallId}`，与 form/generation 卡片的 ID 分开。所有工具的历史响应和 SSE 均不传 arguments、result、完整文件路径或其他执行详情；原始参数和结果保留在 Pi 会话内供模型使用。工具条目只展示名称和状态，不可展开。
- form：id、kind、toolCallId、status（PENDING/SUBMITTED/SKIPPED/CANCELLED）、schemaVersion=2、title、fields。字段为 TEXT 或 SINGLE_SELECT；选项规则沿用工具表单定义。
- generation：id、kind、generationId（执行前可为 null）、status、assets。

Agent 助手区域固定按四部分排列：可折叠的 AI 思考过程（process 文本与 tool）、表单操作、最终回复（final 文本）、图片展示（generation）。已填写、跳过、取消的表单各自折叠，展开显示字段值或操作说明；待填写表单保持可操作。普通生成仅显示真实生成状态和图片，不构造 Agent 回复。

工具项仍按每次调用独立返回，失败后的新调用使用新的 toolCallId，不增加重试关联协议。前端仅在渲染过程区时，将同一创作内连续同类的 text_to_image、image_to_image 或 inspect_image 合并为一行；过程文字、表单、final 文本及其他工具中断分组，generation 图片项不打断分组。read 与 request_user_input 不合并。多次调用显示“成功调用数/已发起调用总数”，单次保持原有标题；分母随新调用增加，表示调用次数而非图片数或预先计划的数量。进行中的组显示执行中，结束后汇总成功、失败、取消，后续成功不掩盖先前失败。原始工具项和结果不因展示合并而删除，实时缓存与历史快照使用同一渲染规则。

投影仅在创作成功或部分成功、最后一条原生 assistant 消息以 stop 结束且没有 toolCall 时，将该消息的文本归为 final。此前每次模型调用的公开文字都保留为 process；表单等待、失败和取消不把中途文字当最终回复。模型 thinking 块、图片二进制、压缩摘要不进入展示 DTO。历史投影与实时事件共享 message-items 转换，工具内部结果不由浏览器重新解释。

工具状态同时检查原生 isError 和结构化业务结果：inspect_image 的 details.outcome=FAILED、生图的 details.status=FAILED 都映射为工具失败，不能因 isError=false 被显示为成功。生图部分交付时 tool 仍为 SUCCEEDED，generation 卡片保留 PARTIALLY_SUCCEEDED；取消状态由执行与会话投影处理。

状态统一为 QUEUED、RUNNING、WAITING_INPUT、SUCCEEDED、PARTIALLY_SUCCEEDED、FAILED、CANCELLED。图片引用内部为 `{assetId,url}`；外部展示为 `{assetId,url,expiresAt}`，不可用时前端可将 url 置 null。签名仅是展示数据，不回写 JSONL。

表单示例：`{"expectedRevision":2,"action":"SUBMITTED","values":{"headline":"把日子慢下来"}}`；跳过使用 `action=SKIPPED`。不接受浏览器改写字段标题、类型、选项或必填规则。

## SSE

- `generation.stream.ready`：连接握手。
- `creation.updated`：`{sessionId,creationId,status,revision}`。
- `creation.item.upserted`：`{sessionId,creationId,item}`，item 与历史协议一致。
- publication.updated、interaction.notification.created 保留既有社区语义。

前端按稳定 ID 修改内存对象，状态忽略旧 revision，文本使用完整内容 upsert。事件可能先于创建响应或历史查询返回，客户端缓冲和合并；断线后 GET 历史恢复，不承诺逐事件补发。

文字采用累计快照：Pi 将模型增量合入当前文本块，TS 每 100ms 合并相同 item.id 的更新并发送最新全文。第一次发送 chunk1，第二次发送 chunk1+chunk2，前端更新同一个段落，不重复追加。100ms 是合并刷新间隔，不是固定字数或传输包大小；当前协议没有增量 offset/sequence，也不需要客户端重放文字增量。

迟到快照不能把 final 文本降回 process、把完成的 tool 改回 RUNNING，或把已处理表单改回 PENDING。取消/失败关闭仍在等待的表单与工具展示，但不据此改写图片任务状态；图片项以独立任务事件和 SQL 历史为准，父创作终止后仍可显示后续完成的图片。生成图片按 assetId 去重；原生调用、实时结果和刷新后的历史对应同一张图片卡片。

## 内部 HTTP 与 MQ

Java → TS 使用 X-AiVista-Worker-Token 与 X-AiVista-User-Id；浏览器无法指定可信用户头。内部 GET/PATCH/DELETE/POST/PUT 路径在上述资源前加 `/internal`。TS 再次核对执行和会话归属。内部 DELETE 成功返回 200 与 `{sessionId,deleted:true}`，Java 将其转换为外部 204 无正文。

TS → Java 仅 `POST /api/internal/creation-runtime/events`，请求 `{events:[...]}`，每个事件另含 userId，使用共享服务令牌。Java 为结构化图片补签名后推送给指定用户。

创作持久化和表单回答后由 TS 本地调度器直接执行，启动及周期扫描 QUEUED 创作兜底，不发送创作 MQ。Java 受理仍依赖 TS 内部 HTTP 在线。

MQ 仅承载图片生成：`aivista.generation.execute.v1` 为 durable quorum，消息为 `{generationId,expectedRevision}`，ID 为十进制字符串。TS 扫描尚未派发的 QUEUED GENERATION 记录，收到发布确认后写 dispatched_at。完整模型参数和授权图片引用保存在 MySQL，不放入消息。

每个部署只运行一个异步图片消费者，`AIVISTA_GENERATION_PREFETCH=200`；普通生成与 Agent 生图工具共用此队列。图片任务通过状态和 revision CAS 领取，模型请求实际发出前平滑限速，默认最多 2 次/秒，不设置第二层模型并发数。等待限速、模型执行、转存及结算全部占用这 200 个未 ACK 名额。消费者不等待上一张图片完成才启动下一次请求；每条图片结果可靠保存后单独 ACK。

重复或过期消息不重复调用模型；已保存的模型响应可用于继续转存和结算。模型请求可能已发出但结果不确定时，写入明确失败原因并收口，不因消息重投而重新付费调用。未发出请求的任务取消后不调用模型，已发出的任务继续保存结果和结算。工具通过数据库终态恢复结果，内存通知和定期查询只负责唤醒。

生成结果、额度和资产由 TS 在同一事务中收口；没有跨服务 completion 请求、Java Agent WebSocket 或 Worker Ledger。
