# 前端 LangGraph 維護指南

## 架構邊界

旅程助理的 LangGraph 完全在瀏覽器執行。主要程式分工如下：

- `src/features/assistant/assistantGraph.ts`：graph、共用模型輸出解析、operation 驗證、摘要策略。
- `src/features/assistant/assistantApi.ts`：正式 UI 使用的 Gemini proxy adapter、依瀏覽器語言的回覆/Places 查證，以及模型估算的交通時間。
- `src/features/assistant/AssistantSection.tsx`：canonical message/proposal persistence、版本重建與聊天室 UI。
- `src/features/assistant/types.ts`：UI、repository 與 graph 共用的公開型別。
- `src/lib/assistantCheckpointer.ts`：以 Supabase Data API 實作 LangGraph `BaseCheckpointSaver`。
- `supabase/functions/gemini-proxy`：只代理已驗證使用者對固定 Gemini model 的 `generateContent`，不執行 graph，也不讀寫資料庫。
- `supabase/migrations/20260812130326_add_travel_assistant.sql`：聊天資料、checkpoint、RLS、checkpoint CAS 與 proposal 原子套用。

LangGraph state 是「可恢復的執行狀態」，不是產品資料的唯一來源。完整聊天歷史與 proposal 分別以 `assistant_messages`、`assistant_proposals` 為準；實際行程仍以 `days`、`attractions` 為準。不要只寫 checkpoint 而略過 canonical tables，也不要從 checkpoint 直接覆寫行程。

建立 runtime 的基本方式是：

```ts
const checkpointer = new SupabaseAssistantCheckpointer(supabase)
const runner = createAssistantGraph(checkpointer, {
  model: browserAssistantModel,
  proposals,
})
```

`proposals` 必須實作 `AssistantProposalPersistence`：先冪等保存 pending proposal，確認或拒絕時再呼叫後端 `apply_assistant_proposal(p_proposal_id, p_approved)`。資料庫 RPC 會檢查擁有者與 day revision，避免前端繞過驗證或跨裝置覆蓋。

## Graph state 與流程

`AssistantGraphState` 位於 `src/features/assistant/types.ts`：

| 欄位 | 用途 |
| --- | --- |
| `graphVersion` | checkpoint 相容性版本；目前為 `ASSISTANT_GRAPH_VERSION = 2`。 |
| `summary` | 已壓縮的舊對話脈絡。 |
| `messages` | graph 目前保留的近期 user/assistant 訊息，不一定是完整聊天歷史。 |
| `request` | 當次尚待 `respond` 處理的 `AssistantTurnRequest`；完成後清為 `null`。 |
| `assistantMessage` | 最近一次模型產生的訊息，方便 UI 取得當次輸出。 |
| `pendingProposal` | 尚待確認或剛完成的 itinerary proposal。 |
| `proposalStatus` | `pending`、`approved`、`applied`、`rejected`、`expired` 或 `null`。 |
| `error` | 預留的可持久化錯誤欄位；目前 graph 錯誤仍向呼叫端 throw。 |

節點與 edge：

```text
START -> respond
  ├─ 無 proposal -> summarize -> END
  └─ 有 proposal -> persist_proposal -> [breakpoint before approval]
       approval
         ├─ approved -> apply_proposal -> summarize -> END
         └─ rejected -> reject_proposal -> END
```

- `respond` 呼叫 `AssistantModel.respond`、建立 assistant message、解析並驗證 operations。
- `assistantApi` 會依 i18n 的目前語言（中文輸入時優先使用 `zh-TW`）傳給 Gemini、Places 與 Geocoder，並要求景點名稱不要使用英文羅馬拼音。中文介面若 Google 仍回傳羅馬拼音，會優先保留模型產生的中文名稱；Google 找不到新增景點時保留 `placeId`、座標為 `null`，不讓整個提案失敗。給模型的行程 context 只保留旅程名稱/日期範圍、每日日期/開始時間，以及供提案引用的 day/attraction ID、順序、名稱、地點、時段、停留時間與交通資訊；不包含費用、描述、revision、Place ID 或座標等內部欄位。prompt 要求推薦先合併摘要、近期對話與完整行程，尊重較新的偏好/否定、避開已排景點並配合當日區域與步調。交通時間由 Gemini 依景點脈絡與交通方式估算整數分鐘；不確定時填 `null`。此流程不呼叫 Routes/Directions，因此不會因路線 API 延遲。
- `persist_proposal` 在暫停前寫入 canonical pending proposal。這個寫入必須能以 proposal/turn ID 冪等重試。
- `approval` 本身不做副作用；它是恢復流程的 routing marker。
- `apply_proposal`、`reject_proposal` 位於確認決策之後，才呼叫 proposal persistence。拒絕是控制決策，不會再觸發摘要或另一個模型回合；輸入框會直接恢復，可繼續討論。
- `summarize` 達門檻時才呼叫模型，更新 `summary` 並只在 graph state 保留近期訊息。

所有 graph invoke 都使用 `durability: 'exit'`。一般 turn 在完成時保存；proposal 在 breakpoint 暫停時保存可恢復狀態，確認後再保存完成狀態。不要改回預設的逐 super-step 寫入，否則每個 turn 會產生更多 checkpoint 與 Data API 往返。

### 一般 turn

1. UI/repository 先以 client-generated `threadId`、`turnId` 保存 user message。
2. 呼叫 `runner.sendTurn(request)`。
3. runner 載入最新 state、檢查 `graphVersion`，將 user message 與 request 送入 graph。
4. `respond` 產生一般回答，`summarize` 視需要壓縮，graph 到達 `END`。
5. `AssistantTurnResult.interrupt` 為 `null`；呼叫端冪等保存 assistant message。

同一個 thread 不可同時送兩個 turn。`assistant_put_checkpoint` 的 CAS 會拒絕落後的分支；收到「另一個裝置已變更」時應重新讀取 thread/messages/state，不能盲目重送舊 state。

### Proposal 暫停與恢復

1. `respond` 只有在使用者明確要求修改時才建立 proposal。
2. `normalizeAssistantOperations` 先把模型只列出部分景點的 reorder 補成完整順序（未提及的景點維持原順序），再由 `validateAssistantOperations` 驗證 day/attraction ID 與重複/未知 ID；新增景點可以沒有 Google 位置資料，禁止虛構座標即可。
3. `persist_proposal` 保存 canonical proposal。
4. graph 在 `approval` 前暫停；`sendTurn` 回傳 `interrupt.kind === 'itinerary_proposal'`，UI 顯示 diff 與確認按鈕。
5. UI 呼叫 `runner.resumeProposal(threadId, approved)`。
6. runner 以 `workflow.updateState(..., 'approval')` 寫入決策，再以相同 thread 繼續 graph。
7. 核准時由 `apply_proposal` 執行原子 RPC；revision 不符回傳 `expired`。拒絕時由 `reject_proposal` 寫入 `rejected` 後直接到 `END`，讓使用者繼續輸入，不另觸發模型。

不要在 `persist_proposal` 或 breakpoint 前改行程。恢復可能重試，任何外部副作用都必須位於決策後，並由 proposal ID 保證冪等。

### 手動整理

`runner.summarizeThread(threadId)`：

1. 讀取最新 checkpoint 並檢查 graph version。
2. 以目前 `summary` 與 state 中的 `messages` 呼叫 `model.summarize`。
3. 透過 `workflow.updateState` 建立新 checkpoint，保存新摘要與最後 `recentMessageCount` 則訊息。

預設自動摘要門檻是 30 則 state 訊息或 24,000 字元，整理後保留最近 10 則。可用 `AssistantGraphDependencies` 覆寫門檻。摘要不刪除 `assistant_messages` 原文，也不可把 pending proposal 的結構化內容只存在摘要中。

## Browser interrupt 決策

必須從 `@langchain/langgraph/web` 匯入 browser-safe graph API。不要在此前端 graph 使用官方 PostgresSaver、Node database driver 或 service-role key。

LangGraph JS 的動態 `interrupt()` 目前透過 `AsyncLocalStorage` 取得執行 config；一般瀏覽器沒有這個 Node runtime 能力，實測會拋出：

```text
Called interrupt() outside the context of a graph.
```

因此目前採用：

```ts
.compile({ checkpointer, interruptBefore: ['approval'] })
```

搭配 `resumeProposal` 的 `updateState(..., 'approval')` 與 `invoke(null)`。不要把它改成節點內的 `interrupt()`，也不要為此加入 Node polyfill。若未來 LangGraph 提供不依賴 AsyncLocalStorage 的 browser interrupt API，必須先用真實 Vite/browser 測試驗證，並保留相同的 typed `AssistantInterruptPayload` 對外 contract。

## Supabase checkpointer

`SupabaseAssistantCheckpointer` 繼承 `BaseCheckpointSaver`，實作：

- `getTuple(config)`：取得指定 checkpoint，未指定 ID 時取 thread/namespace 最新一筆，並載入 pending writes。
- `list(config, options)`：依 checkpoint ID 由新到舊列出，支援 namespace、`before`、metadata filter 與 limit。
- `put(config, checkpoint, metadata, newVersions)`：序列化後呼叫 `assistant_put_checkpoint` RPC。
- `putWrites(config, writes, taskId)`：以複合主鍵 upsert intermediate/pending writes。
- `deleteThread(threadId)`：刪除該 thread writes 與 checkpoints；刪除產品 thread 時資料庫 FK 也會 cascade。

預設資料表可透過 constructor options 覆寫，但正式環境使用：

- `assistant_graph_checkpoints`，主鍵 `(thread_id, checkpoint_ns, checkpoint_id)`；保存 parent ID、typed checkpoint、typed metadata、可選 turn ID。
- `assistant_graph_writes`，主鍵 `(thread_id, checkpoint_ns, checkpoint_id, task_id, idx)`；保存 channel 與 typed value。
- `assistant_threads.latest_checkpoint_id` 是 thread 最新指標。

所有表均啟用 owner-only RLS。瀏覽器只使用登入者 access token 與 publishable key；不可使用 Postgres connection string 或 service role。

### Typed serializer

Saver 使用 LangGraph 提供的 `this.serde.dumpsTyped/loadsTyped`，而不是直接 `JSON.stringify`。序列化結果拆成 type 與 bytes，bytes 再轉 base64 text 存入 Data API。這能正確處理 `Uint8Array` 與 LangChain message 等 typed value。

若變更 schema，`checkpoint_type/checkpoint_payload`、`metadata_type/metadata_payload`、`value_type/value_payload` 必須成對保留。不要只存 JSONB，否則恢復 pending writes 或特殊型別時可能失真。

### CAS 與冪等性

`put` 呼叫：

```text
assistant_put_checkpoint(
  p_thread_id,
  p_checkpoint_ns,
  p_checkpoint_id,
  p_parent_checkpoint_id,
  p_checkpoint_type,
  p_checkpoint_payload,
  p_metadata_type,
  p_metadata_payload,
  p_turn_id,
  p_expected_latest_checkpoint_id
)
```

`p_expected_latest_checkpoint_id` 通常使用本次 checkpoint 的 parent ID；建立無 parent 的新 lineage 時，saver 會先讀取該 namespace 的最新 ID 作為 expected value。RPC 以 `(thread_id, checkpoint_ns)` advisory lock 串行化，確認 namespace 最新 checkpoint 仍符合 expected，才插入並更新 root thread 最新指標；不一致以 SQLSTATE `40001` 拒絕，代表另一個 tab/裝置已前進。

若 RPC 已提交但 HTTP 回應遺失，重送會遇到 CAS 失敗。Saver 會讀取相同 checkpoint ID，只有 type、payload、metadata 與 parent 全部相同才視為成功；不同內容仍拋出原錯誤。不要把所有 `40001` 都吞掉。

## Graph version 與重建

每次改變 state shape、node/edge 的恢復語意、checkpoint serializer contract，或讓舊 breakpoint 無法安全續接時：

1. 增加 `ASSISTANT_GRAPH_VERSION`。
2. 新建 thread 時同步寫入 `assistant_threads.graph_version`。
3. 保留完整 canonical messages/proposals，讓 UI/repository 可從它們重建 state。
4. 捕捉 `AssistantGraphVersionError`；不要用新 graph 直接 resume 舊 checkpoint。
5. 新 turn 以 `assistant_threads.summary` 與 canonical `assistant_messages` 重建新 checkpoint；若舊 checkpoint 正停在 proposal，UI 直接以 canonical proposal ID 呼叫冪等 RPC 完成確認或拒絕，不重跑模型或舊 node。

只改 prompt 文案或 UI 通常不必升版。若無法判斷舊 checkpoint 的 `next` 是否仍能正確落到同一 node，就應升版。

## 擴充方式

### 新增 operation

新增 itinerary 修改能力時必須同步完成：

1. 在 `AssistantOperation` union 加入精確型別。
2. 在 `parseAssistantOperations` 做 runtime allowlist、型別與範圍驗證；未知欄位不可靜默接受。
3. 在 `validateAssistantOperations` 驗證所有引用 ID 與跨欄位 invariant。
4. 更新 Gemini prompt 的 allowed operation 清單及 structured response contract。
5. 在 proposal materializer 將 operation 轉成 before/after snapshots；真正套用仍由 `apply_assistant_proposal` 驗證並原子執行。
6. 補 parser、validator、snapshot、RPC 與 UI diff 測試。

不得讓模型直接指定 owner、revision、資料表名稱或任意 SQL 欄位。新增景點的座標與 Place ID 不應只靠 prompt 信任；Places 查不到時可以保留空值，之後由使用者手動補上。交通時間由模型估算，但必須是非負整數分鐘；無法合理估算時使用 `null`。

### 新增 node

- 先判斷它是否真的需要獨立恢復邊界；每個 node 都可能影響 checkpoint 與 replay。
- 外部 API/DB 副作用必須冪等，並放在 approval 後或獨立 node。
- 更新所有 conditional edge 的完整 routing map，避免未宣告分支。
- 若 node 改變舊 checkpoint 的 `next` 語意，增加 graph version。
- 保持 `durability: 'exit'`，除非需求明確需要更細的恢復點並已有容量評估。

## 測試與故障排查

主要 graph 測試在 `src/features/assistant/assistantGraph.test.ts`。最低驗證：

```sh
npm test -- --run src/features/assistant/assistantGraph.test.ts
npx tsc -p tsconfig.app.json --noEmit
npm run build
```

checkpointer 變更還應以 Supabase local/preview 環境測試 RLS、RPC CAS、pending writes round-trip、刪除 cascade，並跑 LangGraph checkpointer conformance tests。涉及 breakpoint 時一定要測真實瀏覽器重新整理及另一個裝置恢復，單靠 Node 測試不足。

常見問題：

| 症狀 | 原因與處理 |
| --- | --- |
| `Called interrupt() outside the context of a graph` | 使用了動態 `interrupt()`；恢復 `interruptBefore: ['approval']` 的 browser-safe 設計。 |
| `AssistantGraphVersionError` | 本地程式與 checkpoint 版本不同；從 canonical messages/proposal 重建，不要直接 resume。 |
| `Assistant turn request is missing` | 舊 checkpoint 的 request 狀態不完整；UI 會刪除該 runtime checkpoint，依 canonical messages 與本次 request 重建後重試。 |
| `Assistant thread changed on another device` / `40001` | CAS 偵測到同 thread 已前進；重新載入 thread/state，禁止覆蓋或無限自動重試。 |
| Proposal 一直停在 pending | 確認 canonical proposal 已由 `savePending` 寫入，再檢查 `resumeProposal` 是否使用同一 `threadId`。 |
| 核准後重複套用 | `AssistantProposalPersistence.apply` 未以 proposal ID 使用原子、冪等 RPC；應呼叫 `apply_assistant_proposal`。 |
| 套用後確認按鈕再次出現 | canonical proposal 被 replay 的 `savePending` 重設為 pending，或舊的列表請求覆蓋新狀態。保存 proposal 必須使用 `ignoreDuplicates`，UI 以 load sequence 排除過期回應，並在確認後固定顯示 RPC 的 `applied`/`expired` 終態。 |
| 核准後變成 expired | 目標 day revision 已改變；這是預期的衝突保護，重新產生 proposal。 |
| Checkpoint 無法反序列化 | type/payload 配對被改壞、base64 被截斷，或 graph version 未升；不可嘗試用純 JSON 強行恢復。 |
| 摘要後舊訊息在聊天室消失 | UI 錯把 graph `messages` 當完整歷史；聊天室應查 `assistant_messages`，state 只保留模型近期上下文。 |
| 新增景點沒有位置資料 | Google Places/Geocoder 沒有結果；proposal 仍可保存，但 `placeId`、座標與依賴它的 `travelTime` 會是 `null`，可在行程頁補資料後重試。 |
| 排程沒有交通時間 | 模型無法從行程脈絡合理估算；`travelTime` 可保持 `null`，不會阻擋提案。 |
| PWA 更新後舊分頁行為不同 | 舊 bundle 仍在執行；以 graph version 阻止不相容 resume，提示重新載入並重建。 |
