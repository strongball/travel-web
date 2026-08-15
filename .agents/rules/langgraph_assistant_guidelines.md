# LangGraph Assistant Architecture & KISS Guidelines

## 1. Native LangGraph HITL Pattern
- **Tool Command Updates**: UI proposal tools must return `new Command({ update: { pendingProposal, assistantMessage } })`.
- **Checkpoint Breakpoint**: Use `interruptBefore: ['apply_proposal']` for human-in-the-loop decisions.
- **Resumption & Loop Completion**: `runner.resumeTurn` updates state with `userDecision` and invokes graph resumption. `apply_proposal` executes DB changes, generates a `ToolMessage`, and routes back to `respond` for natural LLM conversation completion.

## 2. KISS & Anti-Bloat Invariants
- **No Redundant Wrapper Nodes**: Use LangGraph prebuilt `ToolNode` directly in `StateGraph` instead of creating thin wrapper node files.
- **No Pass-through Re-export Files**: Define Zod schemas and validation in domain-specific folders (`src/features/assistant/tools/<domain>/`). Do not create intermediate pass-through files that just import and re-export schemas.

## 3. Node Decoupling & Proposal Polymorphism
- **Generic Graph Nodes**: Generic nodes (`applyProposalNode`, `respondNode`, `finalizeResponseNode`) must not contain hardcoded tool names (e.g., `propose_itinerary_edit`) or tool-specific operation logic.
- **Base Proposal Hierarchy**: All proposals must conform to `BaseAssistantProposal` (`id`, `threadId`, `turnId`, `title`, `explanation`, `status`, `createdAt`). Domain-specific proposals (such as `ItineraryChangeProposal`) extend this base type.
