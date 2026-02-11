import * as vscode from 'vscode';

export type ModelEntry = {
  name: string;
  provider: 'ollama' | 'openai' | 'anthropic' | 'http';
  modelId: string;
  quant?: string;
  endpoint?: string;
  apiKeySetting?: string;
  roles?: string[];
};

export type AgentSettings = {
  models: ModelEntry[];
  defaultPlanner: string;
  defaultCoder: string;
  defaultSummarizer: string;
  ragServiceUrl: string;
  agentServiceUrl: string;
  retrieveK: number;
  maxChunkTokens: number;
};

export function getSettings(): AgentSettings {
  const cfg = vscode.workspace.getConfiguration('agent');
  return {
    models: cfg.get<ModelEntry[]>('models', []),
    defaultPlanner: cfg.get<string>('defaultPlanner', 'llama3.1:8b'),
    defaultCoder: cfg.get<string>('defaultCoder', 'qwen2.5-coder:14b'),
    defaultSummarizer: cfg.get<string>('defaultSummarizer', 'llama3.1:8b'),
    ragServiceUrl: cfg.get<string>('ragServiceUrl', 'http://127.0.0.1:7777'),
    agentServiceUrl: cfg.get<string>('agentServiceUrl', 'http://127.0.0.1:7788'),
    retrieveK: cfg.get<number>('retrieveK', 8),
    maxChunkTokens: cfg.get<number>('maxChunkTokens', 1500),
  };
}
