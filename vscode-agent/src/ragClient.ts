import fetch from 'node-fetch';
import { URL } from 'node:url';
import { getSettings } from './config';

export type RetrievedChunk = { path: string; snippet: string; offset?: number };

export async function retrieve(query: string, kOverride?: number): Promise<RetrievedChunk[]> {
  const settings = getSettings();
  const k = kOverride ?? settings.retrieveK;
  const url = new URL('/search', settings.ragServiceUrl);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, k }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RAG search failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { results?: RetrievedChunk[] };
  return data.results ?? [];
}

export async function refreshIndex(): Promise<{ indexed: number }> {
  const settings = getSettings();
  const url = new URL('/reindex', settings.ragServiceUrl);
  const res = await fetch(url.toString(), { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RAG reindex failed ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { indexed?: number };
  return { indexed: data.indexed ?? 0 };
}
