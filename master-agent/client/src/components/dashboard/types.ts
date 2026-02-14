export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'delegated' | 'in_progress' | 'review' | 'completed' | 'failed' | 'cancelled' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  dueDate?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface Suggestion {
  id: string;
  title: string;
  body: string;
  agentName: string;
  confidence?: number | null;
  score?: number | null;
  status:
  | 'new'
  | 'merged'
  | 'approved'
  | 'rejected'
  | 'auto_answered'
  | 'auto_delegated'
  | 'needs_review';
  createdAt: string;
  updatedAt: string;
  metadata?: any;
}

export interface TaskDelegation {
  id: string;
  taskId: string;
  agentName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'review';
  intent: string | null;
  confidence: number | null;
  input: any;
  result: any;
  iterations?: any[];
  events?: any[];
  questions?: string | string[] | null;
  error: string | null;
  model: string | null;
  provider: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCapability {
  name: string;
  description: string;
  keywords: string[];
}

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  capabilities: string[];
  models: string[];
  endpoints: any;
  status: 'active' | 'inactive' | 'maintenance';
  version: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export type CustomModel = { name: string; provider: string; apiKey?: string; endpoint?: string };
export type ResultMeta = { model?: string; fallback?: string | null; error?: string; status?: number };
export type ResultPayload = { title: string; body: string; meta?: ResultMeta };
export type ResultItem = ResultPayload & { at: string };

export type TaskForm = { title: string; description: string; priority: string };
export type AgentForm = {
  name: string;
  displayName: string;
  description: string;
  capabilities: string;
  models: string;
  preferredModel: string;
};

export type SecretFormFields = {
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  EMAIL_FROM: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  XAI_API_KEY: string;
  OPENROUTER_API_KEY: string;
  CUSTOM_HTTP_API_KEY: string;
};

export type WidgetZones = {
  header: string[];
  main: string[];
  secondary: string[];
  footer: string[];
};

export type ZoneName = 'header' | 'main' | 'secondary' | 'footer';

export interface StartupWorkflow {
  name: string;
  description: string;
  agent: string;
  auto: boolean;
  stepCount: number;
}

export interface WorkflowRun {
  id: string;
  workflowName: string;
  status: 'pending' | 'completed' | 'failed';
  error?: string | null;
  metadata?: any;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSuggestion {
  id: string;
  agentName: string;
  title: string;
  description: string | null;
  rationale: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'saved';
  confidence: number | null;
  dataSource: string | null;
  metadata: any;
  expiresAt: string | null;
  acceptedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}
