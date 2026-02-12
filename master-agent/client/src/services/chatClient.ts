import axios from 'axios';

export type ChatMode = 'plan' | 'codegen';

export type StreamCallbacks = {
  onToken?: (token: string) => void;
  onDone?: (payload: { text: string; model?: string | null; fallback?: string | null; provider?: string | null }) => void;
  onError?: (message: string) => void;
  onWarn?: (message: string) => void;
};

export type ChatPayload = {
  message: string;
  mode?: ChatMode;
  taskId?: string;
  agentName?: string;
  useRAG?: boolean;
  k?: number;
  model?: string;
  provider?: string;
  apiKey?: string;
  endpoint?: string;
  selection?: string;
  patchMode?: boolean;
};

export async function fetchChatHistory(taskId?: string, limit = 50) {
  const res = await axios.get('http://localhost:3001/chat/history', {
    params: { taskId, limit }
  });
  return res.data?.history || [];
}

export function startChatStream(payload: ChatPayload, callbacks: StreamCallbacks) {
  const controller = new AbortController();
  const { onToken, onDone, onError, onWarn } = callbacks;

  const run = async () => {
    const resp = await fetch('http://localhost:3001/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!resp.body) {
      onError?.('No stream body');
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        if (!part.trim()) continue;
        const lines = part.split('\n');
        let eventName = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.replace('event:', '').trim();
          if (line.startsWith('data:')) dataLine = line.replace('data:', '').trim();
        }
        if (!dataLine) continue;
        try {
          const evtPayload = JSON.parse(dataLine);
          if (eventName === 'token') {
            const token = evtPayload?.text || '';
            if (token) onToken?.(token);
          } else if (eventName === 'done') {
            onDone?.({
              text: evtPayload?.text || '',
              model: evtPayload?.model,
              fallback: evtPayload?.fallback,
              provider: evtPayload?.provider
            });
          } else if (eventName === 'error') {
            onError?.(evtPayload?.message || 'Chat stream error');
          } else if (eventName === 'warn') {
            onWarn?.(evtPayload?.message || 'Chat stream warning');
          }
        } catch (_) {
          // ignore parse errors
        }
      }
    }
  };

  run().catch((err) => {
    if (err?.name === 'AbortError') return;
    onError?.(err?.message || 'Chat stream failed');
  });

  return () => controller.abort();
}
