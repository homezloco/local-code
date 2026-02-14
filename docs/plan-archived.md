# Project Plan & Status

## Completed
- Chat backend: /chat (non-stream) and /chat/stream persist ChatLog + PlanLog with meta/timing; history endpoint available.
- Frontend ChatPanel: SSE streaming with stop/cancel, history load, warn/error handling.
- Dashboard modularization: ChatPanel rendered via widget; TaskModal and AgentModal extracted; drag/drop and resizer intact.
- PlanLog model added and registered in DB init.
- Task auto-delegation: sweep marks tasks in_progress before dispatch and completed/failed on delegate POST; dashboard pulls tasks with latest delegation run metadata.

## In Progress
- Verify end-to-end flows: startup loads tasks/agents, chat streams & cancels, history persists, PlanLog/ChatLog records created.
- Task lifecycle automation: surface delegation runs in UI; need agent-service callbacks/polling to mark completion based on agent output and flag needs_user_input.

## Next Actions
1) Frontend/Backend verification
   - Run app; send chat (plan/codegen) with SSE; confirm streaming UI, stop/cancel works, history shows.
   - Check DB for new ChatLog and PlanLog rows; ensure history fetch on load shows recent chats.
   - Create task/agent via modals; confirm list reloads.
   - Validate task cards show latest delegation status; ensure sweep updates are reflected after refresh.
2) Task lifecycle automation (agent-driven)
   - Add agent-service result callback/poll endpoint; master-agent updates Task.status to completed/failed based on agent output, or needs_user_input when agents ask for approval.
   - Persist/run logs to DelegationRun; surface log excerpts per task in UI.
   - Notify on input-needed states (banner/toast) and allow quick “approve/adjust” responses feeding back to agent-service.
3) Plugin planning/implementation
   - GitHub plugin: auth + repo access for master agent.
   - Google login/email plugin (SMTP alternative).
   - Voice chat option (local or OSS service) and propose other useful plugins.

## Open Items / Risks
- Task/agent submit handlers now POST to APIs; ensure endpoints exist and auth/validation align.
- Model options are derived from profile/custom models; consider adding defaults list if empty.
- Suggestions/templates still inline in Dashboard; optionally modularize further.
- Auto-delegation currently marks completed after POST; true completion requires agent-service response handling.

## Environment Targets
- Master-agent API: http://localhost:3001
- Agent service: http://localhost:7788
- RAG service: http://127.0.0.1:7777
- Ollama: http://127.0.0.1:11434

## References
- Frontend: `master-agent/client/src/components/ChatPanel.tsx`, `Dashboard.tsx` (uses TaskModal/AgentModal).
- Backend: `master-agent/routes/chat.js`, `models/ChatLog.js`, `models/PlanLog.js`, `config/initDb.js`.

## Prioritized Roadmap (Short → Medium → Long Term)

### Short-Term (1–5 days, high impact, low risk)
Focus: Make the current system feel autonomous with minimal new code.

- Add basic ReAct-style loop in agent-service
  - New endpoint `/execute` (or extend `/plan` with `autonomous: true` flag).
  - Simple while loop (max 5–8 iterations):
    - Reason (LLM call: "Think step-by-step + history → next action")
    - Act (tool call: codegen, rag_search, sub-delegate)
    - Observe (capture output/error)
    - Append to history
    - Stop on `final_answer` or max iterations
- Persist iterations in DB (add `iterations` JSON column to Delegation model)
- Show steps in UI (expandable under per-task runs: Thought → Action → Observation)
- Start with 2–3 tools:
  - `rag_search` (call shared-rag `/search`)
  - `codegen` (call existing `/codegen`)
  - `final_answer` (plain text result)
- Use lighter model for inner steps (e.g., `llama3.1:8b` for reasoning, `qwen2.5-coder:7b` for codegen)
- Add "Autonomous Mode" toggle in dashboard
  - Checkbox per task: "Run autonomously" → POST to `/execute` instead of `/plan`
  - Show live progress (polling or SSE if you add it)
  - Add `max_iterations` slider / default (5–10)
- Install & refactor to official ollama npm package
  - `npm i ollama` in agent-service
  - Replace raw fetch calls with `ollama.chat({ model, messages, options, stream })`
  - Enable streaming where possible → future real-time dashboard updates
- Polish UX for autonomy feel
  - Auto-refresh timeline every 10–15s only when task is "running"
  - Add manual "Refresh runs" button
  - Color-code iteration statuses (green success, yellow thinking, red error)
  - Toast notifications for "needs clarification" (if we add that)

### Medium-Term (1–3 weeks, true agentic power)
- Add user clarification / human-in-the-loop
  - In loop: if LLM outputs `{needsClarification: true, questions: ["Q1", "Q2"]}` → set task status `awaiting_input`
  - Dashboard modal pops up with questions → user answers → resume loop with answers in context
- Expand tools safely
  - `file_read` / `file_write` (sandboxed to current project dir)
  - `shell_exec` (strict allow-list or confirmation)
  - `browse_page` (via local proxy or cached DuckDuckGo API if you want semi-web)
- Critique step
  - After each action: extra LLM call ("Critique output vs goal. Done? Score 1–10. Next step?")
  - Use fast local model → decide to stop or continue
- Multi-agent basics
  - Dashboard crew builder: drag roles (Planner, Coder, Reviewer)
  - Sequential handoff: Planner → Coder → Reviewer → loop until approved
- Memory improvements
  - Short-term: session history in loop
  - Long-term: vector store (Chroma or simple SQLite vector extension) for past tasks → RAG over history

### Longer-Term (4+ weeks, production-grade)
- LangGraph.js evaluation → if custom loop becomes hard to maintain, prototype stateful graphs
- Postgres migration + migrations (use Prisma or Sequelize migrations)
- Metrics dashboard widget (success rate by model/provider, avg iterations, time per task)
- Zed extension completion (similar to VSCode one)
- Guardrails & safety (input sanitization, destructive action confirmation, rate limits)
- Self-improvement (meta-agent that tunes prompts or selects better models based on past success)

### Immediate Next Action Suggestion
- Start with #1: basic ReAct loop in agent-service
  - Low risk (new endpoint, no breaking changes)
  - High wow factor (user sees agent thinking multiple steps)
  - Builds on existing pieces (RAG, codegen, DB, UI polling)

## Prioritized Remaining Tasks
1) Wire delegation run logging end-to-end
   - Ensure agent-service posts back or is polled for run status/results (delegations endpoint) so UI modals and timeline populate.
2) Add autonomous-mode toggle in dashboard + backend flag
   - Route task submissions with `autonomous: true` to `/execute`; show live iteration updates.
3) Implement iterations persistence
   - Add `iterations` JSON column on Delegation model; include Thought/Action/Observation in API responses.
4) Streaming and SSE polish
   - Enable streaming in agent-service via official `ollama` client; add polling/refresh cadence for runs and timeline.
5) UI/UX polish for runs
   - Auto-refresh timeline when status is running; add manual “Refresh runs” button; color-code iteration statuses.
6) Human-in-the-loop path
   - When LLM returns `needsClarification`, set task to `awaiting_input`; surface modal/questions; resume with answers.
7) Safety for new tools
   - Add sandboxed file read/write and guarded shell_exec (allow-list/confirmations); browse_page via safe proxy.
8) Metrics and observability
   - Counters for success/fail, iterations per run, model/provider mix; surface in dashboard widget.
