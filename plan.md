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
