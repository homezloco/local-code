import React, { useEffect, useMemo, useState } from 'react';
import { startChatStream, fetchChatHistory, ChatMode } from '../services/chatClient';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  meta?: Record<string, any>;
}

interface TaskRef {
  id: string;
  title: string;
  description?: string;
}

interface AgentRef {
  name: string;
  displayName: string;
}

interface ChatPanelProps {
  tasks: TaskRef[];
  agents: AgentRef[];
  defaultPlannerModel?: string;
  defaultCoderModel?: string;
  defaultRagEnabled?: boolean;
  defaultRagK?: number;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ tasks, agents, defaultPlannerModel, defaultCoderModel, defaultRagEnabled = true, defaultRagK = 6 }) => {
  const [mode, setMode] = useState<ChatMode>('plan');
  const [input, setInput] = useState('');
  const [selection, setSelection] = useState('');
  const [patchMode, setPatchMode] = useState(false);
  const [useRag, setUseRag] = useState(defaultRagEnabled);
  const [ragK, setRagK] = useState(defaultRagK);
  const [model, setModel] = useState(defaultPlannerModel || '');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [stopFn, setStopFn] = useState<(() => void) | null>(null);
  const [taskId, setTaskId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await fetchChatHistory(taskId || undefined, 50);
        const mapped: ChatMessage[] = [];
        rows.forEach((row: any) => {
          mapped.push({ role: 'user', text: row.userMessage || '' });
          if (row.responseText) mapped.push({ role: 'assistant', text: row.responseText, meta: row.meta });
        });
        setHistory(mapped.reverse());
      } catch (err: any) {
        setWarn(err?.message || 'Failed to load history');
      }
    };
    load();
  }, [taskId]);

  const activeModel = useMemo(() => {
    if (model) return model;
    return mode === 'codegen' ? defaultCoderModel || '' : defaultPlannerModel || '';
  }, [model, mode, defaultPlannerModel, defaultCoderModel]);

  const onSend = () => {
    if (!input.trim()) return;
    if (streaming) return;
    setError('');
    setWarn('');
    const userMsg: ChatMessage = { role: 'user', text: input.trim() };
    setHistory((prev) => [...prev, userMsg]);
    setStreaming(true);
    let current = '';
    const stop = startChatStream(
      {
        message: input.trim(),
        mode,
        taskId: taskId || undefined,
        agentName: agentName || undefined,
        useRAG: useRag,
        k: ragK,
        model: activeModel,
        selection: selection.trim() || undefined,
        patchMode: patchMode && mode === 'codegen'
      },
      {
        onToken: (t) => {
          current += t;
          setHistory((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, text: current };
            } else {
              next.push({ role: 'assistant', text: current });
            }
            return next;
          });
        },
        onDone: (payload) => {
          setStreaming(false);
          setStopFn(null);
          if (payload?.text && !current) {
            setHistory((prev) => [...prev, { role: 'assistant', text: payload.text, meta: payload }]);
          } else {
            setHistory((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = { ...last, meta: payload };
              }
              return next;
            });
          }
        },
        onError: (msg) => {
          setStreaming(false);
          setStopFn(null);
          setError(msg);
        },
        onWarn: (msg) => setWarn(msg)
      }
    );

    setStopFn(() => stop);

    // Clear input but keep selection
    setInput('');

    return stop;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-200">Mode</span>
          <select
            className="rounded-md border-slate-800 bg-slate-900/70 text-slate-100 shadow-sm"
            value={mode}
            onChange={(e) => {
              const next = e.target.value as ChatMode;
              setMode(next);
              if (next === 'codegen' && !model && defaultCoderModel) setModel(defaultCoderModel);
              if (next === 'plan' && !model && defaultPlannerModel) setModel(defaultPlannerModel);
            }}
          >
            <option value="plan">Plan</option>
            <option value="codegen">Codegen</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-200">Model</span>
          <input
            className="w-48 rounded-md border-slate-800 bg-slate-900/70 text-slate-100 shadow-sm"
            value={activeModel}
            onChange={(e) => setModel(e.target.value)}
            placeholder="planner/coder"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-200">Task</span>
          <select
            className="rounded-md border-slate-800 bg-slate-900/70 text-slate-100 shadow-sm"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">None</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || t.id}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-200">Agent</span>
          <select
            className="rounded-md border-slate-800 bg-slate-900/70 text-slate-100 shadow-sm"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
          >
            <option value="">None</option>
            {agents.map((a) => (
              <option key={a.name} value={a.name}>
                {a.displayName || a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-200">RAG</span>
          <select
            className="rounded-md border-slate-800 bg-slate-900/70 text-slate-100 shadow-sm"
            value={useRag ? 'true' : 'false'}
            onChange={(e) => setUseRag(e.target.value === 'true')}
          >
            <option value="true">On</option>
            <option value="false">Off</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-200">k</span>
          <input
            type="number"
            className="w-16 rounded-md border-slate-800 bg-slate-900/70 text-slate-100 shadow-sm"
            value={ragK}
            onChange={(e) => setRagK(Number(e.target.value) || 0)}
          />
        </div>
        {mode === 'codegen' && (
          <label className="flex items-center gap-2 text-slate-200">
            <input type="checkbox" checked={patchMode} onChange={(e) => setPatchMode(e.target.checked)} />
            Patch mode
          </label>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2 max-h-72 overflow-auto text-sm">
        {history.length === 0 && <div className="text-slate-400 text-sm">No messages yet.</div>}
        {history.map((m, idx) => (
          <div key={idx} className="space-y-1">
            <div className="text-xs text-slate-500 uppercase">{m.role === 'user' ? 'You' : 'Master Agent'}</div>
            <div className={m.role === 'user' ? 'text-slate-100' : 'text-emerald-100 whitespace-pre-wrap'}>{m.text}</div>
            {m.meta && (
              <div className="text-[11px] text-slate-500">
                {m.meta.model && <span>model: {m.meta.model} </span>}
                {m.meta.fallback && <span>fallback: {m.meta.fallback} </span>}
                {m.meta.provider && <span>provider: {m.meta.provider} </span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <textarea
          className="w-full rounded-md border-slate-800 bg-slate-900/70 text-slate-100 shadow-sm"
          rows={3}
          placeholder={mode === 'codegen' ? 'Ask for code or a patch...' : 'Ask for a plan...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!streaming) onSend();
            }
          }}
        />
        <textarea
          className="w-full rounded-md border-slate-800 bg-slate-900/70 text-slate-100 shadow-sm"
          rows={2}
          placeholder="Optional selection or code snippet"
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={onSend}
            disabled={streaming}
          >
            {streaming ? 'Streaming…' : 'Send'}
          </button>
          {streaming && stopFn && (
            <button
              className="px-3 py-2 rounded-md bg-slate-800 text-slate-100 hover:bg-slate-700 text-xs"
              onClick={() => {
                stopFn();
                setStopFn(null);
                setStreaming(false);
              }}
            >
              Stop
            </button>
          )}
          {streaming && <span className="text-xs text-slate-400">Streaming response…</span>}
          {error && <span className="text-xs text-red-300">{error}</span>}
          {warn && !error && <span className="text-xs text-amber-300">{warn}</span>}
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
