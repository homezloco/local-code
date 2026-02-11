import fetch from 'node-fetch';

export type PlanResponse = { plan?: string; context?: Array<{ path: string; snippet: string; offset?: number }> };
export type CodegenResponse = { diff?: string; context?: Array<{ path: string; snippet: string; offset?: number }> };

export async function callAgentServicePlan(baseUrl: string, question: string, selection: string): Promise<PlanResponse> {
  const res = await fetch(`${baseUrl}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, selection }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agent-service plan ${res.status}: ${text}`);
  }
  return (await res.json()) as PlanResponse;
}

export async function callAgentServiceCodegen(baseUrl: string, task: string, selection: string): Promise<CodegenResponse> {
  const res = await fetch(`${baseUrl}/codegen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, selection }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`agent-service codegen ${res.status}: ${text}`);
  }
  return (await res.json()) as CodegenResponse;
}
