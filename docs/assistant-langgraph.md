# 前端 LangGraph 維護指南

## 架構邊界

旅程助理的 LangGraph 完全在瀏覽器執行：

- `src/features/assistant/graph/assistantGraph.ts`：graph、edge、checkpoint lifecycle、dynamic interrupt 恢復與節點組裝。
- `src/features/assistant/graph/routing.ts`：依 model tool calls 與迭代上限決定工具執行、回模型或完成回覆。
- `src/features/assistant/graph/nodes/`：準備 context、呼叫模型、完成回覆與工具迭代上限。
- `execute_tools`：直接使用 LangGraph `ToolNode` 執行註冊工具。
- `src/features/assistant/tools/proposalToolRuntime.ts`：Todo 與 Itinerary 共用的 `interrupt()`、resume decision 與 ToolMessage payload 處理。
- `src/features/assistant/tools/itinerary/`：行程修改提案的 schema、操作驗證、套用與顯示。
- `src/features/assistant/tools/todo/`：待辦清單提案的 schema、操作套用與顯示。
- `src/features/assistant/tools/search/`：Tavily 聯網即時搜尋工具（`search_web_information`），將結果轉為結構化 Markdown 供模型閱讀。
- `src/features/assistant/components/`：展示層直接訂閱 River(graph → river → component)；`AssistantConversationView` 只持有選取、草稿等檢視狀態並觸發使用者命令，不主動載入對話。
- `src/features/assistant/providers/assistantTurnActionsProvider.ts`：只協調需要同時碰觸 thread collection 與 conversation 的送出、刪除、提案決策與壓縮命令；單一 provider 的 CRUD 直接呼叫其 notifier。
- `src/features/assistant/providers/assistantRuntimeProvider.ts`：依 itinerary 建立 graph runtime、同步 thread summary、發送系統公告，並在提案套用後直接 refresh 既有的 itinerary/expense/todo providers；runtime 不參與 SSR 序列化。
- `src/features/assistant/utils/assistantAttachments.ts`：檔案大小/type 判斷與 FileReader 附件轉換；容器負責丟棄已失效的非同步讀取結果。
- `src/features/assistant/services/assistantTurnFlow.ts`：回合流程的純函數(request 建構、checkpoint 缺漏訊息推導、自動命名),不依賴 React 與 River。
- `src/features/assistant/providers/assistantThreadsProvider.ts`：以 River `AsyncNotifier` family 管理各 itinerary 的 thread collection；CRUD 成功後直接儲存快取。
- `src/features/assistant/providers/assistantConversationsProvider.ts`：以 `{ itineraryId, threadId }` 為 key 的對話 provider = canonical messages + 處理中的 `turn` overlay(streaming 文字、等待決策的提案卡、progress、error)。`build()` 同時載入 canonical history 與 checkpoint、恢復 pending proposal 並回存缺漏的 assistant message；舊載入結果不可覆蓋已開始的 turn。
- 選取中的 `threadId`(sessionStorage 記憶)與輸入草稿是檢視狀態,由容器元件 `AssistantConversationView` 持有;「刪除中」的同步互斥放在 `AssistantThreadsNotifier` 本體(`isDeleting()`),回合錯誤屬於各 thread 的 snapshot。
- 載入錯誤由 River `AsyncValue` 表達；turn 內錯誤屬於各 thread snapshot；短暫 CRUD/附件錯誤仍是 component-local feedback；runtime 公告由 `assistantNoticeProvider(itineraryId)` 持有。
- 過期事件防護由 keyed provider 天然隔離:寫入只落在目標 thread 自己的 snapshot 上(切走再回來仍看得到回合錯誤)。
- `src/lib/assistantCheckpointer.ts`：以 Supabase Data API 實作 LangGraph `BaseCheckpointSaver`。
- `supabase/functions/gemini-proxy`：代理已驗證使用者對固定 Gemini model 的 `generateContent` 與 `streamGenerateContent?alt=sse`；不執行 graph，也不讀寫產品資料。
- `supabase/functions/tavily-proxy`：代理已驗證使用者對 Tavily Search API 的呼叫，隱藏 API Key 並在後端實施搜尋深度與筆數限制。

LangGraph checkpoint 是 pending tool call 與可恢復執行的唯一來源。暫停中的 proposal card 不會寫成 `AssistantMessage`，前端從 checkpoint task 的 interrupt payload 與原本的 AI tool call 推導 `pendingToolCall`；只有工具完成、LLM 產生最後文字後，才會建立 `AssistantMessage`。完成後的 proposal 可附在 `assistant_messages.metadata.proposal`，讓歷史仍能顯示已套用/已拒絕結果；新流程不再讀寫 `assistant_proposals`。實際行程仍以 `days`、`attractions` 與 `todo_items` 為準。

Proposal metadata 只保存穩定顯示與套用所需的 diff snapshots、受影響日期 revisions、Todo 與分類；可由這些資料推導且 UI/RPC 不使用的原始 `operations` 不再重複保存。

建立 runtime：

```ts
const checkpointer = new SupabaseAssistantCheckpointer(supabase)
const runner = createAssistantGraph(checkpointer, {
  proposals: proposalExecution,
})
```

`proposals.apply` 只在使用者同意後呼叫 `apply_assistant_operations(...)`。RPC 直接接收 preview snapshot、Todo 與 expected revisions，並以 user message 的 `threadId + turnId` metadata 作冪等 ledger。

## Context 與 Graph State

| 層級 | 內容 | 來源與壽命 |
| --- | --- | --- |
| Canonical product context | 完整 messages（含完成後 proposal card）、thread summary、最新 itinerary | Supabase tables/RPC；跨裝置的產品事實來源。 |
| Graph runtime context | `summary`、近期 `messages`、本次 `request`、`modelMessages`、`toolRound`，以及 checkpoint task 的 proposal interrupt | LangGraph checkpoint；只用來恢復執行。 |
| Model prompt context | 舊摘要、近期對話、本次 user text、最新 itinerary、待辦與分類 | 每次 `respond` 即時組合；工具完成後的 `ToolMessage` 也會送回模型。 |

`AssistantGraphState`：

| 欄位 | 用途 |
| --- | --- |
| `graphVersion` | checkpoint 相容性版本；目前為 `ASSISTANT_GRAPH_VERSION = 8`。 |
| `summary` | 已壓縮的舊對話脈絡。 |
| `messages` | graph 保留的近期 user/assistant 訊息。 |
| `request` | 當次 `AssistantTurnRequest`；完成後清為 `null`。 |
| `assistantMessage` | 最近一次真正完成的 assistant 訊息；pending interrupt 時保持 `null`。 |
| `pendingToolCall` | 從 checkpoint interrupt 與 AI tool call 推導的待確認工具呼叫，只是 UI view，不是 canonical message。 |
| `modelMessages` | 本回合的 LangChain 工作記憶，包含 HumanMessage、AIMessage、ToolMessage。 |
| `toolRound` | 已執行的工具回合數，上限預設為 4。 |

Graph 不再使用 `pendingProposal` 或 `userDecision` state，也沒有 `apply_proposal` node 或 `interruptBefore`。

## Graph 拓撲 (Graph Flow)

旅程助理的 LangGraph 狀態機採用以 ToolNode 與 Dynamic Interrupt 為核心的迴圈流程：

```mermaid
flowchart TD
    Start(["START"]) --> PrepareContext["prepare_context<br/>(載入摘要、近期訊息、組合 Prompt Context)"]
    PrepareContext --> Respond["respond<br/>(呼叫 Gemini 模型與 Tool Binding)"]

    Respond --> RouteRespond{"routeAfterRespond<br/>(是否有 Tool Call / 超出上限?)"}

    RouteRespond -->|"無 Tool Call (純文字回覆)"| Finalize["finalize_response<br/>(封裝 AssistantMessage、清除 Request)"]
    RouteRespond -->|"有 Tool Call 且未達上限"| ExecuteTools["execute_tools (ToolNode)<br/>(執行註冊工具)"]
    RouteRespond -->|"toolRound >= maxToolRounds"| ToolLimit["tool_limit<br/>(產生達到上限之提示)"]

    ExecuteTools --> RouteTools{"routeAfterTools<br/>(工具執行結果)"}

    subgraph ProposalHITL ["Proposal Human-In-The-Loop (HITL) 審查機制"]
        Interrupt["reviewProposal() -> interrupt()<br/>暫停於 Tool 內部，保存 Checkpoint"]
        ResumeAction["UI 點擊確認/拒絕 -> resumeTurn()<br/>恢復執行並呼叫 apply RPC"]
        Interrupt -.->|"等待使用者審查 (UI 顯示大張待確認卡片)"| ResumeAction
    end

    ExecuteTools -.->|"觸發 Proposal Tool"| Interrupt
    ResumeAction -.->|"套用/拒絕完成"| RouteTools

    RouteTools -->|"toolRound < maxToolRounds (回傳 ToolMessage)"| Respond
    RouteTools -->|"toolRound >= maxToolRounds"| ToolLimit

    ToolLimit --> Finalize
    Finalize --> EndNode(["END"])

    classDef startEnd fill:#0d766e,stroke:#0f766e,color:#ffffff,stroke-width:2px;
    classDef nodeStyle fill:#f0fdfa,stroke:#0d766e,color:#0f172a,stroke-width:1.5px;
    classDef decisionStyle fill:#fef3c7,stroke:#d97706,color:#78350f,stroke-width:1.5px;
    classDef hitlStyle fill:#f8fafc,stroke:#64748b,stroke-dasharray: 5 5,color:#334155;

    class Start,EndNode startEnd;
    class PrepareContext,Respond,ExecuteTools,Finalize,ToolLimit nodeStyle;
    class RouteRespond,RouteTools decisionStyle;
    class ProposalHITL hitlStyle;
```

---

## 時序圖 (Sequence Diagrams)

### 1. 標準對話與查詢流程 (Standard Q&A & Query Tool Flow)

當使用者進行一般對話、諮詢或觸發查詢工具（無須修改資料庫行程）時的時序流程：

```mermaid
sequenceDiagram
    autonumber
    actor User as 使用者
    participant UI as React UI (MessageList)
    participant River as TurnActions + ConversationNotifier
    participant Runner as Assistant Graph Runner
    participant LLM as Gemini Model (Proxy)
    participant DB as Supabase (Data API)

    User->>UI: 送出一般訊息 / 諮詢旅遊資訊
    UI->>River: turnActions.sendMessage(…)
    River->>DB: 儲存 User Message (assistant_messages)
    River->>Runner: sendTurn(request, onProgress, onStream)

    rect rgb(240, 253, 250)
        Note over Runner: 1. prepare_context
        Runner->>Runner: 檢查對話長度、組合摘要與 Prompt Context
    end

    rect rgb(240, 249, 255)
        Note over Runner,LLM: 2. respond
        Runner->>LLM: workflow.stream (帶入 Tools 與對話紀錄)
        LLM-->>Runner: assistant_text_delta (逐段文字)
        Runner-->>River: assistant_text_delta
        River-->>UI: 累加 streamingMessage、即時 Markdown 與閃爍游標
        LLM-->>Runner: 完整 AIMessage (純文字回答，無 Tool Call)
    end

    rect rgb(254, 243, 199)
        Note over Runner: 3. finalize_response
        Runner->>Runner: 建立 AssistantMessage 物件並清除 Request
    end

    Runner-->>River: 回傳 AssistantGraphState (含 assistantMessage)
    River->>DB: 儲存 Assistant Message (assistant_messages)
    River->>UI: 更新對話清單，呈現助理文字回覆
```

---

### 2. Proposal HITL 審查與套用流程 (Proposal Review & HITL Flow)

Todo 與 Itinerary proposal tools 只負責建立各自的 operations 與 proposal 文案，之後都呼叫共用的 `reviewProposal(proposal, runtime)` 進行中斷審查與恢復套用：

1. Proposal ID 直接沿用 `request.turnId`，不另外產生 UUID。
2. Tool 由 tool-call args 建立 operations、diff preview 與 Todo preview。
3. Tool 內呼叫 `interrupt({ type: 'proposal_review', toolCallId, proposal })`。Checkpoint 保存 tool task、interrupt payload 與原本的 AI tool call；runner 將它們轉成 `pendingToolCall`，UI 呈現大張展開的待確認卡片（詢問當下），此時不建立 assistant message。
4. 使用者同意或拒絕時，UI 一律呼叫 `runner.resumeTurn(threadId, decision)`。
5. Runner 以 `workflow.stream(new Command({ resume: decision }), { ...config, streamMode: ['custom', 'values'] })` 恢復原 tool task，並轉發最後回覆的 text delta。
6. Tool 重新執行到同一個 `interrupt()`；同意時呼叫 `proposals.apply`（執行 `apply_assistant_operations` RPC），拒絕時不寫產品資料。
7. Tool 將精簡執行結果放在 `ToolMessage.content`、completed proposal 放在 `ToolMessage.artifact`，避免把完整 diff 傳給模型。
8. `ToolMessage` 回到 `respond` 交給 LLM 產生最後總結文字；`finalize_response` 最後才建立 `AssistantMessage`，並把 completed proposal 附到 message metadata。
9. UI 收到完成訊息後，將歷史提案卡片預設顯示為**摺疊狀態**，可隨時點擊展開檢視。

```mermaid
sequenceDiagram
    autonumber
    actor User as 使用者
    participant UI as React UI (ProposalCard)
    participant River as TurnActions + ConversationNotifier
    participant Runner as Assistant Graph Runner
    participant ToolNode as ToolNode / Proposal Tool
    participant DB as Supabase (RPC / Checkpoint)
    participant LLM as Gemini Model (Proxy)

    User->>UI: 提出修改需求 (例如:「幫我第二天加淺草寺」)
    UI->>River: turnActions.sendMessage(…)
    River->>DB: 儲存 User Message (assistant_messages)
    River->>Runner: sendTurn(request, onProgress)

    Note over Runner,LLM: 1. 模型分析並決定呼叫提案工具
    Runner->>LLM: respond (Context + Tools)
    LLM-->>Runner: AIMessage (tool_calls: propose_itinerary_changes)

    Note over Runner,ToolNode: 2. 執行工具並觸發 Dynamic Interrupt
    Runner->>ToolNode: execute_tools
    ToolNode->>ToolNode: 建立 operations、diff preview 與 todo preview
    ToolNode->>ToolNode: interrupt({ type: 'proposal_review', toolCallId, proposal })
    ToolNode->>DB: CheckpointSaver 儲存中斷狀態 (tasks, interrupts)
    ToolNode-->>Runner: Graph 中斷暫停

    Runner-->>River: 回傳 state (含 pendingToolCall)
    River-->>UI: pendingToolCall -> 顯示大張完整展開的待確認 ProposalCard (詢問當下)

    Note over User,UI: 3. 使用者確認或拒絕
    User->>UI: 點擊「確認儲存並套用」或「不套用，繼續討論」
    UI->>River: turnActions.decideProposal(proposal, approved)
    River->>Runner: resumeTurn(proposal.threadId, { approved }, onStream)

    Note over Runner,ToolNode: 4. 恢復執行工具 (Resume Replay)
    Runner->>ToolNode: Command({ resume: { approved } })
    ToolNode->>ToolNode: 重新執行到同一 interrupt() 並取得 decision

    alt approved == true (確認套用)
        ToolNode->>DB: apply_assistant_operations(RPC) 寫入產品資料表
        DB-->>ToolNode: RPC 回傳 status = 'applied'
    else approved == false (拒絕套用)
        Note over ToolNode: 不呼叫 RPC，標記 status = 'rejected'
    end

    ToolNode-->>Runner: ToolMessage (content: 結果摘要, artifact: completed proposal)

    Note over Runner,LLM: 5. 工具結果送回模型生成總結
    Runner->>LLM: workflow.stream (帶入 ToolMessage)
    LLM-->>Runner: assistant_text_delta (逐段文字)
    Runner-->>River: assistant_text_delta -> UI 累加 streamingMessage
    LLM-->>Runner: 完整 AIMessage (文字總結回覆)

    Note over Runner: 6. finalize_response
    Runner->>Runner: 建立 AssistantMessage (metadata 附上 completed proposal)
    Runner->>DB: 儲存最終 Checkpoint
    Runner-->>River: 回傳完整狀態 (pendingToolCall 清除, 含 assistantMessage)

    River->>DB: 儲存 Assistant Message (含 proposal metadata)
    River->>River: refresh itinerary / expense / todo providers
    River-->>UI: 更新對話歷史 -> ProposalCard 轉為歷史「預設摺疊」卡片
```

### Replay 注意事項

Dynamic interrupt 恢復時會從 tool 開頭重新執行，不是從 `interrupt()` 下一行繼續。因此：

- `interrupt()` 前只建立純資料 preview，不得寫入產品資料。
- Proposal ID 必須穩定，本專案直接使用既有的 `turnId`，不自行產生另一套 UUID。
- 真正的 itinerary/Todo 修改只能放在 `interrupt()` 後。
- Apply RPC 以 user message 的 `threadId + turnId` metadata 保持冪等，避免重複新增 Todo 或景點。
- Approve 與 reject 都必須恢復 graph，不可由 UI 跳過 checkpoint。

## 擴充方式

新增 proposal tool 時：

1. 定義與驗證 tool schema。
2. 從 `ToolRuntime.state.request` 建立 domain operations。
3. 使用 `request.turnId` 作為 proposal ID。
4. 呼叫共用 `reviewProposal`，不要另外建立 interrupt node 或 decision state。
5. 為 approve、reject、ToolMessage card、resume replay 與冪等 execution 加上測試。

一般查詢工具只需加入 `assistantGeneralTools`；正常回傳文字或物件後，`ToolNode` 會包裝成 `ToolMessage` 並回到 `respond`。

## 測試與驗證

- `src/features/assistant/graph/assistantGraph.test.ts`：Graph 流程、dynamic interrupt、approve/reject resume 與摘要。
- `src/features/assistant/api/assistantOperations.test.ts`：操作解析與 itinerary invariants。
- `src/features/assistant/tools/providerToolSchema.test.ts`：Tool schema 與 runtime context 驗證。
- `src/providers/assistantConversationsProvider.test.ts`：provider-owned 載入、checkpoint 恢復、streaming 狀態轉移與 stale completion 防護。
- `src/features/assistant/assistantTurnActionsProvider.test.tsx`：跨 thread/conversation 命令、刪除互斥與切換 thread 的隔離。

```sh
npm test -- --run
npm run build
```
