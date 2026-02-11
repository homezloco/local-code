import fetch from 'node-fetch';
import * as vscode from 'vscode';
import { getSettings, ModelEntry } from './config';

export async function generate(modelName: string, prompt: string, stream = false): Promise<string> {
  const settings = getSettings();
  const entry = pickModel(settings.models, modelName) ?? {
    name: modelName,
    provider: 'ollama',
    modelId: modelName,
  } satisfies ModelEntry;

  switch (entry.provider) {
    case 'ollama':
      return runOllama(entry, prompt, stream);
    case 'openai':
    case 'anthropic':
    case 'http':
      throw new Error(`Provider ${entry.provider} not yet implemented in scaffold`);
    default:
      throw new Error(`Unknown provider ${entry.provider}`);
  }
}

function pickModel(models: ModelEntry[], name: string): ModelEntry | undefined {
  return models.find((m) => m.name === name || m.modelId === name);
}

async function runOllama(entry: ModelEntry, prompt: string, stream: boolean): Promise<string> {
  const body = { model: entry.modelId, prompt, stream, options: entry.quant ? { quant: entry.quant } : undefined };
  const res = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { response?: string };
  return data.response ?? '';
}
