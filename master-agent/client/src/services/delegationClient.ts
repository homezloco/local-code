export type DelegationEvent =
  | 'start'
  | 'plan'
  | 'agent_result'
  | 'agent_error'
  | 'done'
  | 'ping'
  | 'error'
  | 'parse_error'
  | 'message';

export interface DelegationPayload {
  task: string;
  agents: { id: string; name: string; capabilities: string[] }[];
  context?: { useRAG?: boolean; k?: number };
  model?: string;
  provider?: string;
  apiKey?: string;
  endpoint?: string;
}

export interface DelegationCallbacks {
  onEvent: (event: DelegationEvent, data: any) => void;
  onFinish?: () => void;
}

export async function startDelegationStream(payload: DelegationPayload, callbacks: DelegationCallbacks) {
  const controller = new AbortController();
  const resp = await fetch('http://localhost:7788/delegate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  });

  if (!resp.body) {
    callbacks.onEvent('error', { message: 'No response body from delegate endpoint' });
    callbacks.onFinish?.();
    return () => {};
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let cancelled = false;

  const processChunk = (chunkText: string) => {
    buffer += chunkText;
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    parts.forEach((part) => {
      const lines = part.split('\n');
      let event: DelegationEvent = 'message' as DelegationEvent;
      let dataRaw = '';
      lines.forEach((line) => {
        if (line.startsWith('event:')) event = line.replace('event:', '').trim() as DelegationEvent;
        if (line.startsWith('data:')) dataRaw = line.replace('data:', '').trim();
      });
      if (!dataRaw) return;
      try {
        const parsed = JSON.parse(dataRaw);
        callbacks.onEvent(event, parsed);
      } catch (err) {
        callbacks.onEvent('parse_error', { message: 'Failed to parse event', raw: dataRaw });
      }
    });
  };

  const pump = async () => {
    try {
      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) processChunk(decoder.decode(value, { stream: true }));
      }
      processChunk('');
    } catch (err) {
      callbacks.onEvent('error', { message: (err as Error)?.message || 'Delegation stream failed' });
    } finally {
      callbacks.onFinish?.();
    }
  };

  pump();

  return () => {
    cancelled = true;
    controller.abort();
    reader.cancel().catch(() => {});
  };
}
