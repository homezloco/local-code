export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  dueDate?: string;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  capabilities: string[];
  models: string[];
  endpoints: Record<string, unknown>;
  status: 'active' | 'inactive' | 'maintenance';
  version: string;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}
