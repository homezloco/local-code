import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

import { startDelegationStream, DelegationEvent } from '../services/delegationClient';
import DelegationTimeline, { DelegationEntry } from './DelegationTimeline';
import { fetchTemplates, createTemplate, deleteTemplate, TemplateDto } from '../services/templatesClient';
import ChatPanel from './ChatPanel';
import TaskModal from './TaskModal';
import AgentModal from './AgentModal';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  dueDate?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  latestDelegation?: {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    events?: any;
  } | null;
}

interface Agent {
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

interface Suggestion {
  id: string;
  title: string;
  body: string;
  agentName: string;
  confidence?: number | null;
  score?: number | null;
  status: 'new' | 'merged' | 'approved' | 'rejected' | 'auto_answered' | 'auto_delegated' | 'needs_review';
  createdAt: string;
  updatedAt: string;
  metadata?: any;
}

interface ClusterSuggestion {
  id: string;
  title: string;
  body: string;
  agentName: string;
  confidence?: number;
  score?: number;
  status: string;
  createdAt: string;
  metadata?: any;
}

interface Cluster {
  id: string;
  summary: string;
  score: number;
  agents: string[];
  tags: string[];
  topRepresentative?: ClusterSuggestion;
  suggestions: ClusterSuggestion[];
}

interface MasterProfile {
  id: string;
  name: string;
  displayName: string;
  persona?: string;
  traits?: Record<string, any>;
  variables?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const Dashboard: React.FC = () => {
  const apiBase = 'http://localhost:3001';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  type ResultMeta = { model?: string; fallback?: string | null; error?: string; status?: number };
  type ResultPayload = { title: string; body: string; meta?: ResultMeta };
  const [resultModal, setResultModal] = useState<ResultPayload | null>(null);
  const [lastResult, setLastResult] = useState<ResultPayload | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [plannerModel, setPlannerModel] = useState('');
  const [coderModel, setCoderModel] = useState('');
  const [ragK, setRagK] = useState(8);
  const [toast, setToast] = useState<{ text: string; type?: 'success' | 'error' } | null>(null);
  const [mainWidth, setMainWidth] = useState(60);
  const [resizing, setResizing] = useState(false);
  const [customModels, setCustomModels] = useState<{ name: string; provider: string; apiKey?: string; endpoint?: string }[]>([]);
  const [newModel, setNewModel] = useState({ name: '', provider: 'ollama', apiKey: '', endpoint: '' });
  const [clusterMinScore, setClusterMinScore] = useState<number>(0);
  const [clusterAgentFilter, setClusterAgentFilter] = useState('');
  const [uptimeMs, setUptimeMs] = useState(0);
  const [delegationLogs, setDelegationLogs] = useState<Record<string, { ts: number; event: DelegationEvent; data: any }[]>>({});
  const [delegationRunning, setDelegationRunning] = useState<Record<string, boolean>>({});
  const [delegationCancels, setDelegationCancels] = useState<Record<string, () => void>>({});
  const [chatPrefill, setChatPrefill] = useState('');
  const delegationStreamRef = useRef<EventSource | null>(null);

  const [profileForm, setProfileForm] = useState({
    name: 'master-agent',
    displayName: 'Master Agent',
    persona: 'Orchestrator focused on clarity, brevity, and actionable steps.',
    traitTone: 'concise',
    traitRisk: 'cautious',
    traitDomain: 'general',
    defaultPlannerModel: 'codellama:7b-instruct-q4_0',
    fallbackPlannerModel: 'gemma3:1b',
    defaultCoderModel: 'qwen2.5-coder:14b',
    fallbackCoderModel: 'codellama:instruct',
    ragEnabled: true,
    ragKDefault: 6,
    plannerTimeoutMs: 480000,
    retries: 0,
    delegateIntervalMs: 60000,
    autoDelegateEnabled: true,
    loggingLevel: 'info'
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  const [agentForm, setAgentForm] = useState({
    name: '',
    displayName: '',
    description: '',
    capabilities: 'task-management,agent-delegation',
    models: 'master-coordinator',
    preferredModel: ''
  });

  const [formError, setFormError] = useState('');
  const [activeZone, setActiveZone] = useState<'header' | 'main' | 'secondary' | 'footer'>('main');
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>({});
  const [templateForm, setTemplateForm] = useState({
    title: '',
    description: '',
    category: 'custom',
    agents: 'email-agent',
    inputs: '',
    steps: ''
  });

  const handleTemplateSelect = (template: TemplateDto) => {
    setSelectedTemplateId(template.id);
    const initialInputs: Record<string, string> = {};
    (template.inputs || []).forEach((key) => {
      initialInputs[key] = templateInputs[key] || '';
    });
    setTemplateInputs(initialInputs);
  };

  const handleTemplateInputChange = (key: string, value: string) => {
    setTemplateInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleTemplateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    const title = templateForm.title.trim();
    const description = templateForm.description.trim();
    if (!title || !description) {
      setFormError('Template title and description are required');
      return;
    }

    const inputs = templateForm.inputs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const agentsList = templateForm.agents
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const steps = templateForm.steps
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await createTemplate({
        title,
        description,
        category: templateForm.category,
        agents: agentsList,
        inputs,
        steps
      });
      setToast({ text: 'Template saved', type: 'success' });
      setTemplateForm({ title: '', description: '', category: 'custom', agents: 'email-agent', inputs: '', steps: '' });
      await fetchTemplatesList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save template';
      setFormError(msg);
      setToast({ text: msg, type: 'error' });
    }
  };

  const handleTemplateDelete = async (id: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await deleteTemplate(id);
      setToast({ text: 'Template deleted', type: 'success' });
      if (selectedTemplateId === id) {
        setSelectedTemplateId('');
        setTemplateInputs({});
      }
      await fetchTemplatesList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete template';
      setToast({ text: msg, type: 'error' });
    }
  };

  const [widgetZones, setWidgetZones] = useState<{ header: string[]; main: string[]; secondary: string[]; footer: string[] }>(
    { header: [], main: ['tasks', 'templates', 'suggestions'], secondary: ['agents'], footer: ['chat', 'result', 'delegation', 'settings'] }
  );

  const dragWidgetRef = useRef<string | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, widget: string) => {
    dragWidgetRef.current = widget;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, zone: keyof typeof widgetZones) => {
    e.preventDefault();
    const widget = dragWidgetRef.current;
    if (!widget) return;
    setWidgetZones((prev) => {
      // Remove from all zones first
      const next = Object.fromEntries(
        Object.entries(prev).map(([key, list]) => [key, list.filter((w) => w !== widget)])
      ) as typeof prev;
      if (!next[zone].includes(widget)) {
        next[zone] = [...next[zone], widget];
      }
      return next;
    });
    dragWidgetRef.current = null;
  };

  const startResizing = () => setResizing(true);
  const stopResizing = () => setResizing(false);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!resizing) return;
    const pct = Math.min(80, Math.max(20, (e.clientX / window.innerWidth) * 100));
    setMainWidth(pct);
  };

  const renderWidget = (w: string) => {
    switch (w) {
      case 'chat':
        return (
          <ChatPanel
            tasks={tasks.map((t) => ({ id: t.id, title: t.title, description: t.description }))}
            agents={agents.map((a) => ({ name: a.name, displayName: a.displayName }))}
            defaultPlannerModel={profileForm.defaultPlannerModel}
            defaultCoderModel={profileForm.defaultCoderModel}
            defaultRagEnabled={profileForm.ragEnabled}
            defaultRagK={profileForm.ragKDefault}
            prefillText={chatPrefill}
          />
        );

      case 'tasks': {
        const filtered = tasks.filter((t) => {
          const statusOk = taskStatusFilter === 'all' || t.status === taskStatusFilter;
          const priorityOk = taskPriorityFilter === 'all' || t.priority === taskPriorityFilter;
          const searchOk = !taskSearch || `${t.title} ${t.description}`.toLowerCase().includes(taskSearch.toLowerCase());
          return statusOk && priorityOk && searchOk;
        });
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Tasks</h3>
              <button
                className="text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                onClick={() => {
                  setFormError('');
                  setShowTaskModal(true);
                }}
              >
                + New Task
              </button>
            </div>
            {filtered.length === 0 ? (
              <div className="text-slate-400 text-sm">No tasks yet.</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto">
                {filtered.map((t) => (
                  <div key={t.id} className="rounded border border-slate-800 bg-slate-900/80 p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-100">{t.title}</div>
                      <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 capitalize">{t.status}</span>
                    </div>
                    <div className="text-xs text-slate-400">{t.description}</div>
                    <div className="text-[11px] text-slate-500">Priority: {t.priority}</div>
                    {t.latestDelegation && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-slate-800 text-slate-200 capitalize">Run: {t.latestDelegation.status}</span>
                        <span>{new Date(t.latestDelegation.updatedAt).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      case 'agents':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Agents</h3>
              <button
                className="text-sm px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => {
                  setFormError('');
                  setShowAgentModal(true);
                }}
              >
                + Register Agent
              </button>
            </div>
            {agents.length === 0 ? (
              <div className="text-slate-400 text-sm">No agents found.</div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {agents.map((a) => (
                  <div key={a.id} className="rounded border border-slate-800 bg-slate-900/80 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{a.displayName || a.name}</div>
                        <div className="text-[11px] text-slate-500">{a.name}</div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 capitalize">{a.status || 'active'}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 line-clamp-2">{a.description}</div>
                    <div className="text-[11px] text-slate-500 mt-1">Models: {(a.models || []).join(', ') || 'n/a'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'templates':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Templates</h3>
              <button
                className="text-sm px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
                onClick={() => setShowTaskModal(true)}
              >
                Use Template
              </button>
            </div>
            {templates.length === 0 ? (
              <div className="text-slate-400 text-sm">No templates yet.</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto">
                {templates.map((tpl) => (
                  <div key={tpl.id} className="rounded border border-slate-800 bg-slate-900/80 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{tpl.title}</div>
                        <div className="text-xs text-slate-400 mt-1 line-clamp-2">{tpl.description}</div>
                        <div className="text-[11px] text-slate-500 mt-1">Agents: {(tpl.agents || []).join(', ')}</div>
                      </div>
                      <button
                        className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                        onClick={() => setChatPrefill(`${tpl.title}\n${tpl.description}`.trim())}
                      >
                        Use
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'suggestions':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Suggestions</h3>
              <span className="text-xs text-slate-400">Latest clustered suggestions</span>
            </div>
            {suggestions.length === 0 ? (
              <div className="text-slate-400 text-sm">No suggestions yet.</div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto">
                {suggestions.map((s) => (
                  <div key={s.id} className="rounded border border-slate-800 bg-slate-900/80 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-100">{s.title}</div>
                      <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 capitalize">{s.status}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 line-clamp-2">{s.body}</div>
                    <div className="text-[11px] text-slate-500 mt-1">Agent: {s.agentName}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'delegation':
        return (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">Delegation Timeline</h3>
            <DelegationTimeline entries={Object.values(delegationLogs).flat()} />
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Settings</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-200 space-y-1">
                <span>Display name</span>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  value={profileForm.displayName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, displayName: e.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-200 space-y-1">
                <span>Internal name</span>
                <input
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-200 space-y-1 sm:col-span-2">
                <span>Persona / personality</span>
                <textarea
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  rows={2}
                  value={profileForm.persona}
                  onChange={(e) => setProfileForm((p) => ({ ...p, persona: e.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-200 space-y-1">
                <span>Planner model</span>
                <input
                  list="modelOptionsList"
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  value={profileForm.defaultPlannerModel}
                  onChange={(e) => setProfileForm((p) => ({ ...p, defaultPlannerModel: e.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-200 space-y-1">
                <span>Coder model</span>
                <input
                  list="modelOptionsList"
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  value={profileForm.defaultCoderModel}
                  onChange={(e) => setProfileForm((p) => ({ ...p, defaultCoderModel: e.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-200 space-y-1">
                <span>Planner fallback</span>
                <input
                  list="modelOptionsList"
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  value={profileForm.fallbackPlannerModel}
                  onChange={(e) => setProfileForm((p) => ({ ...p, fallbackPlannerModel: e.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-200 space-y-1">
                <span>Coder fallback</span>
                <input
                  list="modelOptionsList"
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  value={profileForm.fallbackCoderModel}
                  onChange={(e) => setProfileForm((p) => ({ ...p, fallbackCoderModel: e.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-200 space-y-1">
                <span>RAG k</span>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  value={profileForm.ragKDefault}
                  onChange={(e) => setProfileForm((p) => ({ ...p, ragKDefault: Number(e.target.value) || 1 }))}
                />
              </label>
              <label className="text-sm text-slate-200 space-y-1">
                <span>Planner timeout (ms)</span>
                <input
                  type="number"
                  min={1000}
                  className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                  value={profileForm.plannerTimeoutMs}
                  onChange={(e) => setProfileForm((p) => ({ ...p, plannerTimeoutMs: Number(e.target.value) || 1000 }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={profileForm.ragEnabled}
                  onChange={(e) => setProfileForm((p) => ({ ...p, ragEnabled: e.target.checked }))}
                />
                <span>Enable RAG by default</span>
              </label>
            </div>
            <button
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
              onClick={() => saveProfile()}
              disabled={profileLoading}
            >
              {profileLoading ? 'Saving...' : 'Save Profile'}
            </button>
            {profileError && <div className="text-sm text-red-400">{profileError}</div>}
          </div>
        );
      case 'result':
        return lastResult ? (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-100">Latest Plan/Codegen</h3>
            <div className="rounded border border-slate-800 bg-slate-950/70 shadow-sm p-3 max-h-64 overflow-auto text-sm whitespace-pre-wrap text-slate-100">
              <div className="text-xs uppercase text-slate-400 mb-2">{lastResult.title}</div>
              {lastResult.body}
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-slate-700 rounded-lg p-4 text-center text-slate-400 bg-slate-900/40">
            Run Plan or Codegen to see results here.
          </div>
        );
      default:
        return <div className="text-slate-400 text-sm">Widget coming soon.</div>;
    }
  };

  const defaultModels = ['llama3', 'llama3.1', 'qwen2.5-coder:14b', 'gpt-4o-mini', 'gpt-4o', 'gemma3:1b'];

  const modelOptions: string[] = Array.from(
    new Set([
      plannerModel,
      coderModel,
      profileForm.defaultPlannerModel,
      profileForm.defaultCoderModel,
      profileForm.fallbackPlannerModel,
      profileForm.fallbackCoderModel,
      ...customModels.map((m) => m.name),
      ...defaultModels
    ].filter(Boolean))
  );

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await axios.post(`${apiBase}/tasks`, {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority
      });
      setToast({ text: 'Task saved', type: 'success' });
      setShowTaskModal(false);
      setEditingTaskId(null);
      setTaskForm({ title: '', description: '', priority: 'medium' });
      // reload tasks
      const res = await axios.get(`${apiBase}/tasks`);
      setTasks(res.data || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save task';
      setFormError(msg);
      setToast({ text: msg, type: 'error' });
    }
  };

  const handleAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await axios.post(`${apiBase}/agents/register`, {
        name: agentForm.name.trim(),
        displayName: agentForm.displayName.trim(),
        description: agentForm.description.trim(),
        capabilities: agentForm.capabilities.split(',').map((s) => s.trim()).filter(Boolean),
        models: agentForm.models.split(',').map((s) => s.trim()).filter(Boolean)
      });
      setToast({ text: 'Agent saved', type: 'success' });
      setShowAgentModal(false);
      setEditingAgentId(null);
      setAgentForm({ name: '', displayName: '', description: '', capabilities: 'task-management,agent-delegation', models: 'master-coordinator', preferredModel: '' });
      const res = await axios.get(`${apiBase}/agents`);
      setAgents(res.data || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save agent';
      setFormError(msg);
      setToast({ text: msg, type: 'error' });
    }
  };

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium'
  });

  const zoneRefs: Record<'header' | 'main' | 'secondary' | 'footer', React.RefObject<HTMLDivElement | null>> = {
    header: useRef<HTMLDivElement | null>(null),
    main: useRef<HTMLDivElement | null>(null),
    secondary: useRef<HTMLDivElement | null>(null),
    footer: useRef<HTMLDivElement | null>(null)
  };

  const fetchTemplatesList = async () => {
    try {
      const list = await fetchTemplates();
      setTemplates(list);
    } catch (err) {
      console.error('Failed to fetch templates', err);
    }
  };

  const loadProfile = async () => {
    try {
      setProfileLoading(true);
      setProfileError('');
      const res = await axios.get(`${apiBase}/profile`);
      const p: MasterProfile = res.data;
      setProfileForm({
        name: p.name || 'master-agent',
        displayName: p.displayName || 'Master Agent',
        persona: p.persona || '',
        traitTone: (p.traits || {}).tone || 'concise',
        traitRisk: (p.traits || {}).risk || 'cautious',
        traitDomain: (p.traits || {}).domain || 'general',
        defaultPlannerModel: (p.variables || {}).defaultPlannerModel || 'codellama:7b-instruct-q4_0',
        fallbackPlannerModel: (p.variables || {}).fallbackPlannerModel || 'gemma3:1b',
        defaultCoderModel: (p.variables || {}).defaultCoderModel || 'qwen2.5-coder:14b',
        fallbackCoderModel: (p.variables || {}).fallbackCoderModel || 'codellama:instruct',
        ragEnabled: (p.variables || {}).ragEnabled ?? true,
        ragKDefault: (p.variables || {}).ragKDefault ?? 6,
        plannerTimeoutMs: (p.variables || {}).plannerTimeoutMs ?? 480000,
        retries: (p.variables || {}).retries ?? 0,
        delegateIntervalMs: (p.variables || {}).delegateIntervalMs ?? 60000,
        autoDelegateEnabled: (p.variables || {}).autoDelegateEnabled ?? true,
        loggingLevel: (p.variables || {}).loggingLevel || 'info'
      });
      // hydrate UI defaults
      setPlannerModel((p.variables || {}).defaultPlannerModel || '');
      setCoderModel((p.variables || {}).defaultCoderModel || '');
      setRagK((p.variables || {}).ragKDefault ?? 8);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load profile';
      setProfileError(msg);
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async () => {
    try {
      setProfileLoading(true);
      setProfileError('');
      await axios.put(`${apiBase}/profile`, {
        name: profileForm.name.trim(),
        displayName: profileForm.displayName.trim(),
        persona: profileForm.persona.trim(),
        traits: { tone: profileForm.traitTone, risk: profileForm.traitRisk, domain: profileForm.traitDomain },
        variables: {
          defaultPlannerModel: profileForm.defaultPlannerModel,
          fallbackPlannerModel: profileForm.fallbackPlannerModel,
          defaultCoderModel: profileForm.defaultCoderModel,
          fallbackCoderModel: profileForm.fallbackCoderModel,
          ragEnabled: profileForm.ragEnabled,
          ragKDefault: profileForm.ragKDefault,
          plannerTimeoutMs: profileForm.plannerTimeoutMs,
          retries: profileForm.retries,
          delegateIntervalMs: profileForm.delegateIntervalMs,
          autoDelegateEnabled: profileForm.autoDelegateEnabled,
          loggingLevel: profileForm.loggingLevel
        }
      });
      setToast({ text: 'Profile saved', type: 'success' });
      setPlannerModel(profileForm.defaultPlannerModel);
      setCoderModel(profileForm.defaultCoderModel);
      setRagK(profileForm.ragKDefault);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile';
      setProfileError(msg);
      setToast({ text: msg, type: 'error' });
    } finally {
      setProfileLoading(false);
    }
  };

  const refreshData = async () => {
    try {
      setLoading(true);
      setError('');
      const [tasksRes, agentsRes] = await Promise.all([
        axios.get(`${apiBase}/tasks`, { params: { includeDelegations: true } }),
        axios.get(`${apiBase}/agents`)
      ]);

      setTasks(tasksRes.data || []);
      let agentsList = agentsRes.data || [];
      // Auto-bootstrap default agents if none exist
      if (!agentsList.length) {
        try {
          const bootstrapRes = await axios.post(`${apiBase}/agents/bootstrap`);
          setToast({ text: bootstrapRes.data?.message || 'Bootstrapped agents', type: 'success' });
          const refreshed = await axios.get(`${apiBase}/agents`);
          agentsList = refreshed.data || [];
        } catch (bootstrapErr) {
          console.error('Failed to bootstrap agents', bootstrapErr);
        }
      }
      setAgents(agentsList);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tasks or agents';
      setError(msg);
      setToast({ text: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    void refreshData();
  }, []);

  useEffect(() => {
    void fetchTemplatesList();
  }, []);

  const cleanupDelegationStream = () => {
    if (delegationStreamRef.current) {
      delegationStreamRef.current.close();
      delegationStreamRef.current = null;
    }
  };

  const fetchDelegationsFallback = async (taskId: string) => {
    try {
      const res = await axios.get(`${apiBase}/delegate/${taskId}/delegations`);
      const delegations = res.data || [];
      setDelegationLogs((prev) => ({
        ...prev,
        [taskId]: (Array.isArray(delegations) ? delegations : []).map((d: any) => ({
          ts: d.updatedAt ? new Date(d.updatedAt).getTime() : Date.now(),
          event: 'message' as DelegationEvent,
          data: d
        }))
      }));
    } catch (err) {
      console.error('Failed fallback fetch delegations', err);
    }
  };

  const subscribeDelegationStream = (taskId: string) => {
    cleanupDelegationStream();
    try {
      const es = new EventSource(`${apiBase}/delegate/${taskId}/delegations/stream`);
      delegationStreamRef.current = es;
      setDelegationRunning((prev) => ({ ...prev, [taskId]: true }));
      setDelegationCancels((prev) => ({ ...prev, [taskId]: () => es.close() }));

      es.addEventListener('delegations', (evt) => {
        try {
          const parsed = JSON.parse((evt as MessageEvent).data || '[]');
          setDelegationLogs((prev) => ({
            ...prev,
            [taskId]: (Array.isArray(parsed) ? parsed : []).map((d: any) => ({
              ts: d.updatedAt ? new Date(d.updatedAt).getTime() : Date.now(),
              event: 'message' as DelegationEvent,
              data: d
            }))
          }));
        } catch (err) {
          console.error('Failed to parse delegation stream payload', err);
        }
      });

      es.addEventListener('error', () => {
        setDelegationRunning((prev) => ({ ...prev, [taskId]: false }));
        cleanupDelegationStream();
        void fetchDelegationsFallback(taskId);
      });
    } catch (err) {
      console.error('Failed to open delegation stream', err);
      void fetchDelegationsFallback(taskId);
    }
  };

  useEffect(() => {
    if (!editingTaskId) {
      cleanupDelegationStream();
      return;
    }
    subscribeDelegationStream(editingTaskId);
    return () => cleanupDelegationStream();
  }, [editingTaskId]);

  const navItems: { label: string; target: keyof typeof zoneRefs; widget?: string }[] = [
    { label: 'Dashboard', target: 'header' },
    { label: 'Tasks', target: 'main', widget: 'tasks' },
    { label: 'Suggestions', target: 'main', widget: 'suggestions' },
    { label: 'Agents', target: 'main', widget: 'agents' },
    { label: 'Templates', target: 'main', widget: 'templates' },
    { label: 'Chat', target: 'footer', widget: 'chat' },
    { label: 'Plan/Codegen', target: 'footer', widget: 'result' },
    { label: 'Settings', target: 'footer', widget: 'settings' }
  ];

  const dropZoneClasses = 'min-h-[120px] border border-slate-800 rounded-xl p-4 bg-slate-900/50 backdrop-blur shadow-inner';

  const scrollToZone = (target: keyof typeof zoneRefs, widget?: string) => {
    const el = zoneRefs[target].current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveZone(target);
    }
    if (widget) {
      setWidgetZones((prev) => {
        if (prev[target].includes(widget)) return prev;
        return { ...prev, [target]: [...prev[target], widget] };
      });
    }
  };

  const renderZone = (zone: keyof typeof widgetZones, title: string) => (
    <div
      className={dropZoneClasses}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDrop(e, zone)}
    >
      <div className="flex items-center justify-between mb-2 text-sm font-semibold text-slate-200">
        <span>{title}</span>
        <span className="text-slate-500">Drop widgets here</span>
      </div>
      <div className="space-y-3">
        {widgetZones[zone].map((w) => (
          <div
            key={`${zone}-${w}`}
            className="border border-slate-800 rounded-md bg-slate-950/70 shadow-sm"
          >
            <div
              className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900 cursor-move"
              draggable
              onDragStart={(e) => handleDragStart(e, w)}
            >
              <span className="text-sm font-medium text-slate-100 capitalize">{w}</span>
              <span className="text-slate-500 text-xs">⇅</span>
            </div>
            <div className="p-3">{renderWidget(w)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div
        className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100 flex overflow-x-hidden"
        onMouseMove={handleMouseMove}
        onMouseUp={stopResizing}
      >
        <aside className="w-64 bg-slate-900/80 border-r border-slate-800 hidden md:flex flex-col backdrop-blur shadow-xl">
          <div className="px-4 py-5 border-b border-slate-800">
            <div className="text-lg font-semibold text-white">Master Agent</div>
            <div className="text-xs text-slate-400">Local dashboard</div>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2 text-sm">
            {navItems.map((item) => (
              <button
                key={item.label}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                  activeZone === item.target
                    ? 'bg-slate-800 text-white shadow-inner'
                    : 'text-slate-200 hover:bg-slate-800/80'
                }`}
                onClick={() => scrollToZone(item.target, item.widget)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="px-4 py-4 text-xs text-slate-500 border-t border-slate-800">API: {new Date().toLocaleTimeString()}</div>
        </aside>

        <div className="flex-1 flex flex-col">
          <datalist id="modelOptionsList">
            {modelOptions.map((opt, idx) => (
              <option key={`${opt}-${idx}`} value={opt} />
            ))}
          </datalist>
          <header className="bg-slate-900/70 border-b border-slate-800 shadow-lg backdrop-blur">
            <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3">
                <button
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg shadow"
                  onClick={() => {
                    setFormError('');
                    setShowTaskModal(true);
                  }}
                >
                  + New Task
                </button>
                <button
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2 rounded-lg shadow"
                  onClick={() => {
                    setFormError('');
                    setShowAgentModal(true);
                  }}
                >
                  + Register Agent
                </button>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300">Planner</span>
                  <input
                    list="modelOptionsList"
                    className="w-44 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={plannerModel}
                    onChange={(e) => setPlannerModel(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-300">Coder</span>
                  <input
                    list="modelOptionsList"
                    className="w-44 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={coderModel}
                    onChange={(e) => setCoderModel(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-300">RAG k</span>
                  <input
                    type="number"
                    min={1}
                    className="w-20 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={ragK}
                    onChange={(e) => setRagK(Number(e.target.value) || 1)}
                  />
                </div>
              </div>
            </div>
          </header>

          <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-6">
            <section ref={zoneRefs.header} id="header" className="scroll-mt-20">
              {renderZone('header', 'Header Zone')}
            </section>

            <div className="flex items-stretch gap-3 relative">
              <section
                ref={zoneRefs.main}
                id="main"
                className="bg-slate-900/60 rounded-xl shadow-lg flex-1 p-4 border border-slate-800 backdrop-blur scroll-mt-20"
                style={{ width: `${mainWidth}%` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-white">Main Content</h2>
                  <div className="flex gap-2 text-sm">
                    <div className="flex flex-col">
                      <span className="text-slate-300">Status</span>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        value={taskStatusFilter}
                        onChange={(e) => setTaskStatusFilter(e.target.value)}
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-300">Priority</span>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        value={taskPriorityFilter}
                        onChange={(e) => setTaskPriorityFilter(e.target.value)}
                      >
                        <option value="all">All</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-300">Search</span>
                      <input
                        className="mt-1 w-56 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="Search title or description"
                        value={taskSearch}
                        onChange={(e) => setTaskSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                {renderZone('main', 'Main Zone')}
              </section>

              <div
                className="w-2 cursor-col-resize bg-slate-800/70 rounded-lg"
                onMouseDown={startResizing}
              />

              <section
                ref={zoneRefs.secondary}
                id="secondary"
                className="bg-slate-900/60 rounded-xl shadow-lg flex-1 p-4 border border-slate-800 backdrop-blur scroll-mt-20"
                style={{ width: `${100 - mainWidth}%` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-white">Secondary Content</h2>
                  <div className="flex flex-col text-sm">
                    <span className="text-slate-300">Agent Search</span>
                    <input
                      className="mt-1 w-56 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="Search name or description"
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                    />
                  </div>
                </div>
                {renderZone('secondary', 'Secondary Zone')}
              </section>
            </div>

            <section ref={zoneRefs.footer} id="footer" className="scroll-mt-20">
              {renderZone('footer', 'Footer Zone')}
            </section>
          </div>
        </div>
      </div>

      <TaskModal
        open={showTaskModal}
        form={taskForm}
        error={formError}
        editingId={editingTaskId}
        onChange={(next) => setTaskForm(next)}
        onClose={() => {
          setShowTaskModal(false);
          setEditingTaskId(null);
          setFormError('');
        }}
        onSubmit={handleTaskSubmit}
      />

      <AgentModal
        open={showAgentModal}
        form={agentForm}
        error={formError}
        editingId={editingAgentId}
        modelOptions={modelOptions}
        onChange={(next) => setAgentForm(next)}
        onClose={() => {
          setShowAgentModal(false);
          setEditingAgentId(null);
          setFormError('');
        }}
        onSubmit={handleAgentSubmit}
      />

      {/* Result Modal */}
      {resultModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">{resultModal.title}</h2>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setResultModal(null)}
              >
                ✕
              </button>
            </div>
            {resultModal.meta && (
              <div className="text-xs text-gray-600 mb-3 space-y-1">
                <div>Model: {resultModal.meta.model || 'n/a'}</div>
                {resultModal.meta.fallback && <div>Fallback: {resultModal.meta.fallback}</div>}
                {resultModal.meta.status && <div>Status: {resultModal.meta.status}</div>}
                {resultModal.meta.error && <div className="text-red-600">Error: {resultModal.meta.error}</div>}
              </div>
            )}
            <div className="rounded border border-gray-200 bg-gray-50 p-3 max-h-96 overflow-auto text-sm text-gray-900 whitespace-pre-wrap">
              {resultModal.body}
            </div>
            <div className="flex justify-end mt-4">
              <button
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => setResultModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`rounded-md px-4 py-3 shadow-lg text-white max-w-sm break-words ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}
          >
            <div className="flex items-start gap-3">
              <span className="flex-1">{toast.text}</span>
              <button className="text-white/80 hover:text-white" onClick={() => setToast(null)} aria-label="Close toast">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Dashboard;