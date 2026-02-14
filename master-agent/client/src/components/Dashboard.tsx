import React, { useEffect, useRef, useState } from 'react';

import axios from 'axios';

import { startDelegationStream, DelegationEvent } from '../services/delegationClient';
import { useDashboardData } from './dashboard/useDashboardData';
import { useDashboardHandlers } from './dashboard/useDashboardHandlers';
import DelegationTimeline, { DelegationEntry } from './DelegationTimeline';
import { fetchTemplates, createTemplate, deleteTemplate, TemplateDto } from '../services/templatesClient';
import ChatPanel from './ChatPanel';
import TaskModal from './dashboard/TaskModal';
import AgentModal from './dashboard/AgentModal';
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
import DelegationStreamModal from './dashboard/DelegationStreamModal';
import WorkflowRunsWidget from './dashboard/WorkflowRunsWidget';
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
  status: 'pending' | 'delegated' | 'in_progress' | 'review' | 'completed' | 'failed' | 'cancelled';
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

  const {
    loading,
    refreshData,
    fetchTemplatesList,
    startupWorkflows,
    startupWorkflowsLoading,
    fetchStartupWorkflows,
    workflowRuns,
    workflowRunsLoading,
    fetchWorkflowRuns,
    profileLoading,
    setProfileLoading,
    setProfileError,
    loadProfile,
    saveProfile
  } = useDashboardData();

  const {
    showTaskModal, setShowTaskModal,
    showAgentModal, setShowAgentModal,
    editingTaskId, setEditingTaskId,
    editingAgentId, setEditingAgentId,
    fieldErrors, setFieldErrors,
    toast, setToast,
    taskForm, setTaskForm,
    agentForm, setAgentForm,
    handleTaskSubmit,
    handleCancelTask,
    handleArchiveTask,
    handleRetryTask,
    handleAgentSubmit,
    handleTemplateSubmit,
    handleTemplateDelete,
    isSubmitting
  } = useDashboardHandlers(refreshData, fetchTemplatesList);

  // Local-only UI state
  const [error, setError] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');

  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  type LocalResultMeta = { model?: string; fallback?: string | null; error?: string; status?: number };
  type LocalResultPayload = { title: string; body: string; meta?: LocalResultMeta; at?: number };
  const [resultModal, setResultModal] = useState<LocalResultPayload | null>(null);
  const [lastResult, setLastResult] = useState<LocalResultPayload | null>(null);
  const [resultHistory, setResultHistory] = useState<LocalResultPayload[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [plannerModel, setPlannerModel] = useState('');
  const [coderModel, setCoderModel] = useState('');
  const [ragK, setRagK] = useState(8);
  const [customModels, setCustomModels] = useState<{ name: string; provider: string; apiKey?: string; endpoint?: string }[]>([]);
  const [newModel, setNewModel] = useState({ name: '', provider: 'ollama', apiKey: '', endpoint: '' });
  const [clusterMinScore, setClusterMinScore] = useState<number>(0);
  const [clusterAgentFilter, setClusterAgentFilter] = useState('');
  const [uptimeMs, setUptimeMs] = useState(0);
  const [delegationLogs, setDelegationLogs] = useState<Record<string, DelegationEntry[]>>({});
  const [workflowSuggestTopic, setWorkflowSuggestTopic] = useState('daily startup automation');
  const [workflowSuggestAgent, setWorkflowSuggestAgent] = useState('master-agent');
  const [workflowSuggestion, setWorkflowSuggestion] = useState<any | null>(null);
  const [workflowSuggestionValid, setWorkflowSuggestionValid] = useState<boolean | null>(null);
  const [workflowSuggestionError, setWorkflowSuggestionError] = useState('');
  const [workflowSuggestionRaw, setWorkflowSuggestionRaw] = useState<string>('');
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

  const handleCancelStreamingTask = () => {
    if (!streamingTaskId) return;
    const task = tasks.find((t) => String(t.id) === String(streamingTaskId));
    if (!task) {
      setToast({ text: 'Task not found for cancel', type: 'error' });
      return;
    }
    void handleCancelTask(task);
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
      setWorkflowSuggestionRaw('');
      const res = await axios.post(`${apiBase}/workflows/suggest`, {
        topic: workflowSuggestTopic,
        agent: workflowSuggestAgent,
        approve,
        workflow: approve ? workflowSuggestion : undefined
      });
      setWorkflowSuggestion(res.data?.data || res.data?.proposal || null);
      setWorkflowSuggestionValid(res.data?.status === 'success');
      if (res.data?.error) setWorkflowSuggestionError(res.data.error);
      if (res.data?.rawResponse) setWorkflowSuggestionRaw(res.data.rawResponse);
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

      const delegations = res.data?.data || res.data || [];
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

  const pushResultHistory = (payload: LocalResultPayload) => {
    setResultHistory((prev) => [{ ...payload, at: payload.at || Date.now() }, ...prev].slice(0, 50));
  };

  const handleChatResult = ({ text, meta, mode }: { text: string; meta?: Record<string, any>; mode: 'plan' | 'codegen' }) => {
    const payload = {
      title: mode === 'codegen' ? 'Codegen result' : 'Plan result',
      body: text,
      meta,
      at: Date.now()
    } satisfies LocalResultPayload;
    setLastResult(payload);
    pushResultHistory(payload);
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
          const statusOk =
            (taskStatusFilter === 'all' && t.status !== 'archived') ||
            t.status === taskStatusFilter;
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
              console.log('Run plan for task:', task.id);
            }}
            runCodegen={(task) => {
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
              console.log('View code for task:', task.id);
            }}
            onCancel={handleCancelTask}
            onArchive={handleArchiveTask}
            onRetry={handleRetryTask}
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
                      <div className="flex gap-2 items-center">
                        <button
                          className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
                          onClick={() => setChatPrefill(`${tpl.title}\n${tpl.description}`.trim())}
                        >
                          Use
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                          onClick={() => handleTemplateDelete(tpl.id)}
                        >
                          Delete
                        </button>
                      </div>
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
                        className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(workflowSuggestion, null, 2)).catch(() => { });
                          setToast({ text: 'JSON copied to clipboard', type: 'success' });
                        }}
                      >
                        Copy JSON
                      </button>
                    </div>
                    {workflowSuggestionValid === false && (
                      <div className="text-xs text-red-400">Validation: {workflowSuggestionError || 'invalid'}</div>
                    )}
                    {workflowSuggestionError && (
                      <div className="text-xs text-red-400">{workflowSuggestionError}</div>
                    )}
                    {workflowSuggestionRaw && (
                      <details className="text-xs text-slate-300">
                        <summary className="cursor-pointer">Raw agent response</summary>
                        <pre className="mt-1 max-h-40 overflow-auto bg-slate-950 p-2 rounded border border-slate-800 text-[11px] whitespace-pre-wrap">
                          {workflowSuggestionRaw}
                        </pre>
                      </details>
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
                          setWorkflowSuggestionRaw('');
                        }}
                      >
                        Clear
                      </button>
                      <button
                        className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm disabled:opacity-50"
                        onClick={() => suggestWorkflow(false)}
                        disabled={workflowSuggestLoading}
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}
                {workflowSuggestionError && !workflowSuggestion && (
                  <div className="space-y-2">
                    <div className="text-xs text-red-400">{workflowSuggestionError}</div>
                    {workflowSuggestionRaw && (
                      <details className="text-xs text-slate-300">
                        <summary className="cursor-pointer">Raw agent response</summary>
                        <pre className="mt-1 max-h-40 overflow-auto bg-slate-950 p-2 rounded border border-slate-800 text-[11px] whitespace-pre-wrap">
                          {workflowSuggestionRaw}
                        </pre>
                      </details>
                    )}
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm disabled:opacity-50"
                        onClick={() => suggestWorkflow(false)}
                        disabled={workflowSuggestLoading}
                      >
                        Retry
                      </button>
                      <button
                        className="px-3 py-1 rounded border border-slate-700 text-slate-200 text-sm hover:bg-slate-800"
                        onClick={() => {
                          setWorkflowSuggestionError('');
                          setWorkflowSuggestionRaw('');
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
            onResult={handleChatResult}
          />
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
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">History: {resultHistory.length}</div>
              <button
                className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50"
                onClick={() => lastResult && setResultModal(lastResult)}
                disabled={!lastResult}
              >
                View full results
              </button>
            </div>
          </div>
        );
      case 'workflowRuns': {
        return (
          <WorkflowRunsWidget
            workflowRuns={workflowRuns}
            loading={workflowRunsLoading}
            onRefresh={() => void fetchWorkflowRuns()}
          />
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
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border border-transparent ${activeZone === item.target
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
                <button
                  className="inline-flex items-center justify-center px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm text-sm"
                  onClick={() => {
                    setFieldErrors({});
                    setShowTaskModal(true);
                  }}
                >
                  + New Task
                </button>
                <button
                  className="inline-flex items-center justify-center px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm text-sm"
                  onClick={() => {
                    setFieldErrors({});
                    setShowAgentModal(true);
                  }}
                >
                  + Register Agent
                </button>
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

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          editingTaskId={editingTaskId}
          errors={fieldErrors}
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          onSubmit={handleTaskSubmit}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTaskId(null);
            setTaskForm({ title: '', description: '', priority: 'medium' });
          }}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Agent Modal */}
      {showAgentModal && (
        <AgentModal
          editingAgentId={editingAgentId}
          errors={fieldErrors}
          agentForm={agentForm}
          setAgentForm={setAgentForm}
          onSubmit={handleAgentSubmit}
          onClose={() => {
            setShowAgentModal(false);
            setEditingAgentId(null);
            setAgentForm({ name: '', displayName: '', description: '', capabilities: 'task-management,agent-delegation', models: 'master-coordinator', preferredModel: '' });
          }}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Delegation Stream Modal */}
      <DelegationStreamModal
        streamingTaskId={streamingTaskId}
        streamingTaskTitle={streamingTaskTitle}
        streamKey={streamKey}
        delegationRunning={Boolean(delegationRunning?.[streamKey])}
        streamEntries={streamEntries}
        onCancelTask={handleCancelStreamingTask}
        onClose={() => {
          cleanupDelegationStream();
          setStreamingTaskId(null);
          setStreamingTaskTitle('');
        }}
      />

      {/* Result Modal */}
      {resultModal && (
        <ResultModal
          resultModal={resultModal}
          onClose={() => setResultModal(null)}
        />
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
