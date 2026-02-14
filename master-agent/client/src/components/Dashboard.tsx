import React, { useState, useEffect, useRef } from 'react';

import axios from 'axios';

import { startDelegationStream, DelegationEvent } from '../services/delegationClient';
import DelegationTimeline, { DelegationEntry } from './DelegationTimeline';
import { fetchTemplates, createTemplate, deleteTemplate, TemplateDto } from '../services/templatesClient';
import ChatPanel from './ChatPanel';
import TaskModal from './TaskModal';
import AgentModal from './AgentModal';
import ClarificationModal from './dashboard/ClarificationModal';

// Import modular dashboard components
import { DashboardLayout } from './dashboard/DashboardLayout';
import TasksWidget from './dashboard/TasksWidget';
import AgentsWidget from './dashboard/AgentsWidget';
import ResultWidget from './dashboard/ResultWidget';
import SettingsWidget from './dashboard/SettingsWidget';
import SuggestionsWidget from './dashboard/SuggestionsWidget';
import CodeReviewWidget from './dashboard/CodeReviewWidget';
import ResultModal from './dashboard/ResultModal';
import { getStatusColor, getPriorityColor, renderMarkdown, Skeleton } from './dashboard/helpers';
import { useDashboardStore } from './dashboard/store/dashboardStore';

import type {
  Task as DashboardTask,
  Agent as DashboardAgent,
  CustomModel,
  ResultMeta,
  ResultPayload,
  TaskForm,
  AgentForm,
  SecretFormFields,
  ZoneName,
  StartupWorkflow,
  WorkflowRun
} from './dashboard/types';

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

export default function Dashboard(): JSX.Element {
  const apiBase = 'http://localhost:3001';
  const delegationStreamRef = useRef<EventSource | null>(null);

  const {
    tasks,
    setTasks,
    agents,
    setAgents,
    suggestions,
    setSuggestions,
    templates,
    setTemplates,
    selectedTemplateId,
    setSelectedTemplateId,
    templateInputs,
    setTemplateInputs,
    templateForm,
    setTemplateForm,
    widgetZones,
    setWidgetZones,
    profileForm,
    setProfileForm
  } = useDashboardStore();

  // Local-only UI state
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
  const [customModels, setCustomModels] = useState<{ name: string; provider: string; apiKey?: string; endpoint?: string }[]>([]);
  const [newModel, setNewModel] = useState({ name: '', provider: 'ollama', apiKey: '', endpoint: '' });
  const [clusterMinScore, setClusterMinScore] = useState<number>(0);
  const [clusterAgentFilter, setClusterAgentFilter] = useState('');
  const [uptimeMs, setUptimeMs] = useState(0);
  const [delegationLogs, setDelegationLogs] = useState<Record<string, DelegationEntry[]>>({});
  const [startupWorkflows, setStartupWorkflows] = useState<StartupWorkflow[]>([]);
  const [startupWorkflowsLoading, setStartupWorkflowsLoading] = useState(false);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [workflowRunsLoading, setWorkflowRunsLoading] = useState(false);
  const [workflowSuggestTopic, setWorkflowSuggestTopic] = useState('daily startup automation');
  const [workflowSuggestAgent, setWorkflowSuggestAgent] = useState('master-agent');
  const [workflowSuggestion, setWorkflowSuggestion] = useState<any | null>(null);
  const [workflowSuggestionValid, setWorkflowSuggestionValid] = useState<boolean | null>(null);
  const [workflowSuggestionError, setWorkflowSuggestionError] = useState('');
  const [workflowSuggestLoading, setWorkflowSuggestLoading] = useState(false);
  const [workflowEditName, setWorkflowEditName] = useState('');
  const [workflowEditJson, setWorkflowEditJson] = useState('');
  const [workflowEditError, setWorkflowEditError] = useState('');
  const [workflowEditLoading, setWorkflowEditLoading] = useState(false);
  const [delegationRunning, setDelegationRunning] = useState<Record<string, boolean>>({});
  const [delegationCancels, setDelegationCancels] = useState<Record<string, () => void>>({});
  const [clarifyModal, setClarifyModal] = useState<{ taskId: string; questions: string[]; answers: string[] } | null>(null);
  const [chatPrefill, setChatPrefill] = useState('');
  const [streamingTaskId, setStreamingTaskId] = useState<string | null>(null);
  const [delegating, setDelegating] = useState(false);
  const [streamingTaskTitle, setStreamingTaskTitle] = useState<string>('');

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
  const [collapsedWidgets, setCollapsedWidgets] = useState<Record<string, boolean>>({});
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);

  const toggleCollapse = (widget: string) => {
    setCollapsedWidgets((prev) => ({ ...prev, [widget]: !prev[widget] }));
  };

  const toggleExpand = (widget: string) => {
    setExpandedWidget((prev) => (prev === widget ? null : widget));
  };

  const handleTemplateSelect = (template: TemplateDto) => {
    setSelectedTemplateId(template.id);
    const initialInputs: Record<string, string> = {};
    (template.inputs || []).forEach((key) => {
      initialInputs[key] = templateInputs[key] || '';
    });
    setTemplateInputs(initialInputs);
  };

  const handleTemplateInputChange = (key: string, value: string) => {
    setTemplateInputs({ ...templateInputs, [key]: value });
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

  const renderWidget = (w: string) => {
    switch (w) {
      case 'newTask':
        return (
          <div className="flex justify-center">
            <button
              className="inline-flex items-center justify-center px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm"
              onClick={() => {
                setFormError('');
                setShowTaskModal(true);
              }}
            >
              + New Task
            </button>
          </div>
        );
      case 'registerAgent':
        return (
          <div className="flex justify-center">
            <button
              className="inline-flex items-center justify-center px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm"
              onClick={() => {
                setFormError('');
                setShowAgentModal(true);
              }}
            >
              + Register Agent
            </button>
          </div>
        );
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
          <TasksWidget
            filteredTasks={filtered}
            openTaskModalForEdit={(task) => {
              setEditingTaskId(task.id);
              setTaskForm({ title: task.title, description: task.description, priority: task.priority });
              setShowTaskModal(true);
            }}
            runPlan={(task) => {
              // Plan logic here
              console.log('Run plan for task:', task.id);
            }}
            runCodegen={(task) => {
              // Codegen logic here
              console.log('Run codegen for task:', task.id);
            }}
            onDelegate={(task, opts) => {
              const doDelegate = async () => {
                try {
                  setDelegating(true);
                  await axios.post(`${apiBase}/api/delegate/${task.id}/delegate`, {
                    agentName: task.assignedTo || undefined,
                    autonomous: opts?.autonomous ?? true
                  });
                  setToast({ text: 'Delegation started', type: 'success' });
                  await refreshData();
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Failed to delegate task';
                  setToast({ text: msg, type: 'error' });
                } finally {
                  setDelegating(false);
                }
              };
              void doDelegate();
            }}
            onViewCode={(task) => {
              // View code logic here
              console.log('View code for task:', task.id);
            }}
            actionLoading={delegating}
          />
        );
      }
      case 'agents':
        return (
          <AgentsWidget
            filteredAgents={agents.filter((a) => 
              !agentSearch || `${a.name} ${a.displayName} ${a.description}`.toLowerCase().includes(agentSearch.toLowerCase())
            )}
            openAgentModalForEdit={(agent) => {
              setEditingAgentId(agent.id);
              setAgentForm({
                name: agent.name,
                displayName: agent.displayName,
                description: agent.description,
                capabilities: agent.capabilities.join(', '),
                models: agent.models.join(', '),
                preferredModel: ''
              });
              setShowAgentModal(true);
            }}
            deleteAgent={async (id) => {
              if (!window.confirm('Delete this agent?')) return;
              try {
                await axios.delete(`${apiBase}/agents/${id}`);
                setToast({ text: 'Agent deleted', type: 'success' });
                const res = await axios.get(`${apiBase}/agents`);
                setAgents(res.data || []);
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to delete agent';
                setToast({ text: msg, type: 'error' });
              }
            }}
          />
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
            <h3 className="text-lg font-semibold text-slate-100">Delegation Timeline</h3>
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
              <label className="text-sm text-slate-200 space-y-1 sm:col-span-2">
                <span>Startup workflows</span>
                <div className="space-y-2">
                  {startupWorkflowsLoading ? (
                    <Skeleton className="w-full h-4" rows={2} />
                  ) : (
                    startupWorkflows.map((workflow) => (
                      <div key={workflow.name} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-100 font-semibold truncate">{workflow.name}</div>
                          <div className="text-xs text-slate-400 truncate">{workflow.description}</div>
                          <div className="text-[11px] text-slate-500">Agent: {workflow.agent} · Steps: {workflow.stepCount}</div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-200 whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={workflow.auto}
                            onChange={(e) => toggleWorkflowAuto(workflow.name, e.target.checked)}
                          />
                          Auto
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </label>
              <div className="sm:col-span-2 space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Suggest new workflow</div>
                    <div className="text-xs text-slate-400">Master agent drafts JSON; approve to save</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-50"
                      onClick={() => suggestWorkflow(false)}
                      disabled={workflowSuggestLoading || !workflowSuggestTopic.trim()}
                    >
                      {workflowSuggestLoading ? 'Suggesting…' : 'Suggest'}
                    </button>
                    <button
                      className="px-3 py-1 rounded border border-slate-700 text-slate-200 text-sm hover:bg-slate-800 disabled:opacity-50"
                      onClick={() => suggestWorkflow(false)}
                      disabled={workflowSuggestLoading || !workflowSuggestTopic.trim()}
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-200 space-y-1">
                    <span>Topic</span>
                    <input
                      className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                      value={workflowSuggestTopic}
                      onChange={(e) => setWorkflowSuggestTopic(e.target.value)}
                    />
                  </label>
                  <label className="text-xs text-slate-200 space-y-1">
                    <span>Agent</span>
                    <input
                      className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                      value={workflowSuggestAgent}
                      onChange={(e) => setWorkflowSuggestAgent(e.target.value)}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    onClick={() => setWorkflowSuggestTopic('daily code review summary')}
                  >
                    Daily code review
                  </button>
                  <button
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    onClick={() => setWorkflowSuggestTopic('morning inbox triage and summary')}
                  >
                    Morning inbox
                  </button>
                  <button
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    onClick={() => setWorkflowSuggestTopic('weekly portfolio snapshot and risks')}
                  >
                    Weekly portfolio
                  </button>
                </div>
                {workflowSuggestion && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-300">Proposal</div>
                    <div className="rounded border border-slate-800 bg-slate-950/70 shadow-sm p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">{workflowSuggestion.name || 'Unnamed workflow'}</div>
                          <div className="text-xs text-slate-400">{workflowSuggestion.description || 'No description'}</div>
                        </div>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-slate-800 text-slate-200">{workflowSuggestion.agent || 'agent'}</span>
                      </div>
                      <div className="space-y-1">
                        {(workflowSuggestion.steps || []).map((step: any, idx: number) => (
                          <div key={idx} className="text-xs text-slate-200">
                            <span className="font-semibold text-slate-100">Step {idx + 1}: {step.title || 'Untitled'}</span>
                            {step.description && <div className="text-slate-400">{step.description}</div>}
                          </div>
                        ))}
                      </div>
                      <button
                        className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(workflowSuggestion, null, 2)).catch(() => {});
                          setToast({ text: 'JSON copied to clipboard', type: 'success' });
                        }}
                      >
                        Copy JSON
                      </button>
                    </div>
                    {workflowSuggestionValid === false && (
                      <div className="text-xs text-red-400">Validation: {workflowSuggestionError || 'invalid'}</div>
                    )}
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
                        disabled={workflowSuggestLoading || workflowSuggestionValid === false}
                        onClick={() => {
                          if (!window.confirm('Save this workflow? It will run on next startup if auto=true.')) return;
                          void suggestWorkflow(true);
                        }}
                      >
                        {workflowSuggestLoading ? 'Saving…' : 'Approve & Save'}
                      </button>
                      <button
                        className="px-3 py-1 rounded border border-slate-700 text-slate-200 text-sm hover:bg-slate-800"
                        onClick={() => {
                          setWorkflowSuggestion(null);
                          setWorkflowSuggestionValid(null);
                          setWorkflowSuggestionError('');
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
                {workflowSuggestionError && !workflowSuggestion && (
                  <div className="text-xs text-red-400">{workflowSuggestionError}</div>
                )}
              </div>
            </div>
            <button
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
              onClick={() => saveProfile()}
              disabled={profileLoading}
            >
              {profileLoading ? 'Saving...' : 'Save Profile'}
            </button>
            {profileError && <div className="text-sm text-red-400">{profileError}</div>}
            {/* Workflow editor */}
            <div className="sm:col-span-2 space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">Edit existing workflow</div>
                  <div className="text-xs text-slate-400">Load JSON, edit, and save</div>
                </div>
                <div className="flex gap-2 items-center">
                  <select
                    className="rounded border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-sm"
                    value={workflowEditName}
                    onChange={(e) => {
                      setWorkflowEditName(e.target.value);
                      setWorkflowEditJson('');
                      setWorkflowEditError('');
                      if (e.target.value) void fetchWorkflowContent(e.target.value);
                    }}
                  >
                    <option value="">Select workflow</option>
                    {startupWorkflows.map((wf) => (
                      <option key={wf.name} value={wf.name}>
                        {wf.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
                    onClick={() => workflowEditName && fetchWorkflowContent(workflowEditName)}
                    disabled={!workflowEditName || workflowEditLoading}
                  >
                    Reload
                  </button>
                </div>
              </div>
              <textarea
                className="w-full rounded-md border border-slate-700 bg-slate-900/70 text-slate-100 px-2 py-1 text-xs min-h-[200px]"
                value={workflowEditJson}
                onChange={(e) => setWorkflowEditJson(e.target.value)}
                placeholder="Workflow JSON"
              />
              {workflowEditError && <div className="text-xs text-red-400">{workflowEditError}</div>}
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-50"
                  onClick={saveWorkflowContent}
                  disabled={workflowEditLoading || !workflowEditName}
                >
                  {workflowEditLoading ? 'Saving…' : 'Save Workflow'}
                </button>
                <button
                  className="px-3 py-1 rounded border border-slate-700 text-slate-200 text-sm hover:bg-slate-800"
                  onClick={() => {
                    setWorkflowEditJson('');
                    setWorkflowEditError('');
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        );
      case 'result':
        return (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-100">Latest Plan/Codegen</h3>
            {lastResult ? (
              <div className="rounded border border-slate-800 bg-slate-950/70 shadow-sm p-3 max-h-64 overflow-auto text-sm whitespace-pre-wrap text-slate-100">
                <div className="text-xs uppercase text-slate-400 mb-2">{lastResult.title}</div>
                {lastResult.body}
              </div>
            ) : (
              <div className="border border-dashed border-slate-700 rounded-lg p-4 text-center text-slate-400 bg-slate-900/40">
                Run Plan or Codegen to see results here.
              </div>
            )}
          </div>
        );
      case 'workflowRuns': {
        const formatTs = (ts?: string | null) => (ts ? new Date(ts).toLocaleString() : '—');
        const calcDuration = (run: WorkflowRun) => {
          const start = run.startedAt ? new Date(run.startedAt).getTime() : 0;
          const end = run.completedAt ? new Date(run.completedAt).getTime() : 0;
          if (!start || !end || end < start) return '—';
          const seconds = Math.max(1, Math.round((end - start) / 1000));
          return `${seconds}s`;
        };
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">Workflow Runs</h3>
              <button
                className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                onClick={() => void fetchWorkflowRuns()}
                disabled={workflowRunsLoading}
              >
                {workflowRunsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {workflowRunsLoading ? (
              <Skeleton className="w-full h-4" rows={3} />
            ) : workflowRuns.length === 0 ? (
              <div className="text-slate-400 text-sm">No runs yet.</div>
            ) : (
              <div className="max-h-80 overflow-auto border border-slate-800 rounded">
                <table className="w-full text-xs text-slate-200">
                  <thead className="bg-slate-900/80 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Workflow</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Started</th>
                      <th className="px-3 py-2 text-left">Completed</th>
                      <th className="px-3 py-2 text-left">Duration</th>
                      <th className="px-3 py-2 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflowRuns.map((run) => (
                      <tr key={run.id} className="border-t border-slate-800">
                        <td className="px-3 py-2">{run.workflowName}</td>
                        <td className="px-3 py-2 capitalize">{run.status}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatTs(run.startedAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatTs(run.completedAt)}</td>
                        <td className="px-3 py-2">{calcDuration(run)}</td>
                        <td className="px-3 py-2 text-red-400 truncate max-w-[200px]">{run.error || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      }
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

  const fetchTemplatesList = async () => {
    try {
      const list = await fetchTemplates();
      setTemplates(list);
    } catch (err) {
      console.error('Failed to fetch templates', err);
    }
  };

  const fetchStartupWorkflows = async () => {
    try {
      setStartupWorkflowsLoading(true);
      const res = await axios.get(`${apiBase}/workflows/files`);
      setStartupWorkflows((res.data?.workflows as StartupWorkflow[]) || []);
    } catch (err) {
      console.error('Failed to load startup workflows', err);
    } finally {
      setStartupWorkflowsLoading(false);
    }
  };

  const fetchWorkflowRuns = async () => {
    try {
      setWorkflowRunsLoading(true);
      const res = await axios.get(`${apiBase}/workflows/runs`);
      setWorkflowRuns((res.data?.runs as WorkflowRun[]) || []);
    } catch (err) {
      console.error('Failed to load workflow runs', err);
    } finally {
      setWorkflowRunsLoading(false);
    }
  };

  const fetchWorkflowContent = async (name: string) => {
    if (!name) return;
    try {
      setWorkflowEditLoading(true);
      setWorkflowEditError('');
      const res = await axios.get(`${apiBase}/workflows/files/${name}`);
      setWorkflowEditJson(JSON.stringify(res.data?.workflow ?? {}, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load workflow';
      setWorkflowEditError(msg);
      setWorkflowEditJson('');
    } finally {
      setWorkflowEditLoading(false);
    }
  };

  const saveWorkflowContent = async () => {
    if (!workflowEditName || !workflowEditJson.trim()) {
      setWorkflowEditError('Select a workflow and provide JSON.');
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(workflowEditJson);
    } catch (err) {
      setWorkflowEditError('Invalid JSON.');
      return;
    }
    try {
      setWorkflowEditLoading(true);
      setWorkflowEditError('');
      const exists = startupWorkflows.some((wf) => wf.name === parsed.name);
      if (exists && parsed.name !== workflowEditName) {
        setWorkflowEditError('Name conflicts with another workflow. Rename and try again.');
        setWorkflowEditLoading(false);
        return;
      }
      if (exists && !window.confirm('Overwrite existing workflow file?')) {
        setWorkflowEditLoading(false);
        return;
      }
      await axios.put(`${apiBase}/workflows/files/${workflowEditName}`, parsed);
      setToast({ text: 'Workflow saved', type: 'success' });
      await fetchStartupWorkflows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save workflow';
      setWorkflowEditError(msg);
    } finally {
      setWorkflowEditLoading(false);
    }
  };

  const toggleWorkflowAuto = async (name: string, auto: boolean) => {
    try {
      await axios.post(`${apiBase}/workflows/files/${name}/auto`, { auto });
      await fetchStartupWorkflows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update workflow auto flag';
      setToast({ text: msg, type: 'error' });
    }
  };

  const suggestWorkflow = async (approve = false) => {
    try {
      setWorkflowSuggestLoading(true);
      setWorkflowSuggestionError('');
      const res = await axios.post(`${apiBase}/workflows/suggest`, {
        topic: workflowSuggestTopic,
        agent: workflowSuggestAgent,
        approve,
        workflow: approve ? workflowSuggestion : undefined
      });
      setWorkflowSuggestion(res.data?.proposal || null);
      setWorkflowSuggestionValid(Boolean(res.data?.valid));
      if (res.data?.validationError) setWorkflowSuggestionError(res.data.validationError);
      if (res.data?.saved) {
        setToast({ text: 'Workflow saved', type: 'success' });
        await fetchStartupWorkflows();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to suggest workflow';
      setWorkflowSuggestionError(msg);
      setToast({ text: msg, type: 'error' });
    } finally {
      setWorkflowSuggestLoading(false);
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
    void fetchStartupWorkflows();
    void fetchWorkflowRuns();
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
      const res = await axios.get(`${apiBase}/api/delegate/${taskId}/delegations`);

      const delegations = res.data || [];
      setDelegationLogs((prev) => ({
        ...prev,
        [taskId]: (Array.isArray(delegations) ? delegations : []).map((d: any) => ({
          ts: d.updatedAt ? new Date(d.updatedAt).getTime() : Date.now(),
          event: 'message' as DelegationEvent,
          data: d
        }))
      }));

      if (Array.isArray(delegations)) extractClarification(delegations, taskId);
    } catch (err) {
      console.error('Failed fallback fetch delegations', err);
    }
  };

  const subscribeDelegationStream = (taskId: string) => {
    cleanupDelegationStream();
    try {
      const es = new EventSource(`${apiBase}/api/delegate/${taskId}/delegations/stream`);

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

          if (Array.isArray(parsed)) extractClarification(parsed, taskId);
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

  const streamKey = streamingTaskId ?? '';
  const streamEntries = streamingTaskId ? delegationLogs[streamKey] ?? [] : [];

  const navItems: { label: string; target: ZoneName; widget?: string }[] = [
    { label: 'Dashboard', target: 'header' },
    { label: 'Tasks', target: 'main', widget: 'tasks' },
    { label: 'Suggestions', target: 'main', widget: 'suggestions' },
    { label: 'Agents', target: 'main', widget: 'agents' },
    { label: 'Templates', target: 'main', widget: 'templates' },
    { label: 'Chat', target: 'footer', widget: 'chat' },
    { label: 'Plan/Codegen', target: 'footer', widget: 'result' },
    { label: 'Settings', target: 'footer', widget: 'settings' }
  ];

  useEffect(() => {
    if (streamingTaskId) {
      subscribeDelegationStream(streamingTaskId);
    }
    return () => cleanupDelegationStream();
  }, [streamingTaskId]);

  const extractClarification = (delegations: any[], taskId: string) => {
    const clarifying = delegations.find(
      (d: any) => d?.result?.status === 'needs_clarification' && Array.isArray(d?.result?.questions) && d.result.questions.length > 0
    );
    if (clarifying) {
      const qs = clarifying.result.questions as string[];
      setClarifyModal((prev) => (prev?.taskId === taskId ? prev : { taskId, questions: qs, answers: qs.map(() => '') }));
    }
  };

  const handleClarifyAnswerChange = (idx: number, value: string) => {
    if (!clarifyModal) return;
    setClarifyModal({ ...clarifyModal, answers: clarifyModal.answers.map((a, i) => (i === idx ? value : a)) });
  };

  const submitClarifications = async () => {
    if (!clarifyModal) return;
    try {
      await axios.post(`${apiBase}/api/delegate/${clarifyModal.taskId}/clarify`, { answers: clarifyModal.answers });
      setToast({ text: 'Clarifications submitted, resuming delegation', type: 'success' });
      setClarifyModal(null);
      void refreshData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit clarifications';
      setToast({ text: msg, type: 'error' });
    }
  };

  return (
    <>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex">

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-lg font-semibold text-white">Master Agent</div>
          <div className="text-xs text-slate-400">Coordinator dashboard</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border border-transparent ${
                activeZone === item.target
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'text-slate-200 hover:bg-slate-800 hover:text-white border-slate-800'
              }`}
              onClick={() => setActiveZone(item.target)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
          Uptime: {Math.floor(uptimeMs / 1000)}s
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
          <div className="px-6 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <h1 className="text-xl font-semibold text-white">Dashboard</h1>
              <p className="text-xs text-slate-400">Manage tasks, agents, and delegation</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {widgetZones.header.map((widget) => (
                <div key={widget} className="inline-flex items-center">
                  {renderWidget(widget)}
                </div>
              ))}
            </div>
          </div>
        </header>

        <DashboardLayout
          widgetZones={widgetZones}
          setWidgetZones={setWidgetZones}
          renderWidget={renderWidget}
          widgetLabels={{
            newTask: 'New Task',
            registerAgent: 'Register Agent',
            tasks: 'Tasks',
            agents: 'Agents',
            templates: 'Templates',
            suggestions: 'Suggestions',
            chat: 'Chat',
            result: 'Plan/Codegen',
            delegation: 'Delegation',
            settings: 'Settings'
          }}
          collapsedWidgets={collapsedWidgets}
          expandedWidget={expandedWidget}
          onToggleCollapse={toggleCollapse}
          onToggleExpand={toggleExpand}
        />

        <footer className="border-t border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div>Master Agent Dashboard v1.0</div>
            <div> 2024 - Autonomous Coordination System</div>
          </div>
        </footer>
      </div>
    </div>

    {/* Delegation Stream Modal */}
    {streamingTaskId !== null && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div>
              <h2 className="text-lg font-semibold text-white">Live Delegation Stream</h2>
              <p className="text-xs text-slate-400">{streamingTaskTitle}</p>
            </div>
            <div className="flex items-center gap-2">
              {streamingTaskId !== null && delegationRunning?.[streamKey] && (

                <span className="text-[11px] px-2 py-1 rounded-full bg-green-900/50 text-green-200 border border-green-700">Streaming</span>
              )}
              <button
                className="text-slate-300 hover:text-white text-xl leading-none px-2"
                onClick={() => {
                  cleanupDelegationStream();
                  setStreamingTaskId(null);
                  setStreamingTaskTitle('');
                }}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <DelegationTimeline entries={streamEntries} title="Iteration Timeline" running={Boolean(delegationRunning?.[streamKey])} />
            <div className="h-px bg-slate-800" />
            {streamEntries.length === 0 ? (
              <div className="text-slate-400 text-sm">No delegation events yet.</div>
            ) : (
              streamEntries
                .slice()
                .sort((a, b) => a.ts - b.ts)
                .map((entry, idx) => (
                  <div
                    key={`${entry.ts}-${idx}`}
                    className="flex items-start gap-3 rounded border border-slate-800 bg-slate-950/60 p-3 text-sm"
                  >
                    <span className="text-slate-300 font-semibold min-w-[80px]">{entry.event}</span>
                    <span className="text-slate-200 whitespace-pre-wrap break-words flex-1">
                      {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}
                    </span>
                    <span className="text-[11px] text-slate-500 min-w-[90px] text-right">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    )}

    {/* Result Modal */}
    {resultModal && (
      <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">{resultModal?.title}</h2>
            <button className="text-gray-500 hover:text-gray-700" onClick={() => setResultModal(null)}>
              ✕
            </button>
          </div>
          {resultModal?.meta && (
            <div className="text-xs text-gray-600 mb-3 space-y-1">
              <div>Model: {resultModal.meta?.model || 'n/a'}</div>
              {resultModal.meta?.fallback && <div>Fallback: {resultModal.meta.fallback}</div>}
              {resultModal.meta?.status && <div>Status: {resultModal.meta.status}</div>}
              {resultModal.meta?.error && <div className="text-red-600">Error: {resultModal.meta.error}</div>}
            </div>
          )}
          <div className="rounded border border-gray-200 bg-gray-50 p-3 max-h-96 overflow-auto text-sm text-gray-900 whitespace-pre-wrap">
            {resultModal?.body}
          </div>
          <div className="flex justify-end mt-4">
            <button className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={() => setResultModal(null)}>
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
          className={`rounded-md px-4 py-3 shadow-lg text-white max-w-sm break-words ${toast?.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}
        >
          <div className="flex items-start gap-3">
            <span className="flex-1">{toast?.text}</span>
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