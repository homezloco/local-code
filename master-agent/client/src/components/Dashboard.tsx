import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

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

const Dashboard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  const [plannerModel, setPlannerModel] = useState('llama3.1:8b');
  const [coderModel, setCoderModel] = useState('qwen2.5-coder:14b');
  const [ragK, setRagK] = useState(8);
  const [toast, setToast] = useState<{ text: string; type?: 'success' | 'error' } | null>(null);
  const [mainWidth, setMainWidth] = useState(60);
  const [resizing, setResizing] = useState(false);
  const [widgetZones, setWidgetZones] = useState<{ header: string[]; main: string[]; secondary: string[]; footer: string[] }>(
    { header: [], main: ['tasks'], secondary: ['agents'], footer: ['result'] }
  );
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium'
  });
  const [agentForm, setAgentForm] = useState({
    name: '',
    displayName: '',
    description: '',
    capabilities: 'task-management,agent-delegation',
    models: 'master-coordinator'
  });
  const [formError, setFormError] = useState('');
  const [activeZone, setActiveZone] = useState<'header' | 'main' | 'secondary' | 'footer'>('header');
  const zoneRefs: Record<'header' | 'main' | 'secondary' | 'footer', React.RefObject<HTMLDivElement | null>> = {
    header: useRef<HTMLDivElement | null>(null),
    main: useRef<HTMLDivElement | null>(null),
    secondary: useRef<HTMLDivElement | null>(null),
    footer: useRef<HTMLDivElement | null>(null)
  };
  const navItems: { label: string; target: keyof typeof zoneRefs }[] = [
    { label: 'Dashboard', target: 'header' },
    { label: 'Tasks', target: 'main' },
    { label: 'Agents', target: 'secondary' },
    { label: 'Plan/Codegen', target: 'footer' },
    { label: 'Settings', target: 'footer' }
  ];

  const layoutPresets: Record<
    'balanced' | 'tasks-focused' | 'agents-focused',
    { mainWidth: number; widgetZones: { header: string[]; main: string[]; secondary: string[]; footer: string[] } }
  > = {
    balanced: { mainWidth: 60, widgetZones: { header: [], main: ['tasks'], secondary: ['agents'], footer: ['result'] } },
    'tasks-focused': {
      mainWidth: 70,
      widgetZones: { header: ['result'], main: ['tasks'], secondary: ['agents'], footer: [] }
    },
    'agents-focused': {
      mainWidth: 55,
      widgetZones: { header: [], main: ['agents'], secondary: ['tasks'], footer: ['result'] }
    }
  };

  const applyPreset = (key: keyof typeof layoutPresets) => {
    const preset = layoutPresets[key];
    setMainWidth(preset.mainWidth);
    setWidgetZones(preset.widgetZones);
    setActiveZone('main');
  };

  const modelOptions = Array.from(
    new Set([
      'qwen2.5-coder:14b',
      'qwen2.5-coder:7b',
      'llama3.1:8b',
      'llama3.1:8b-instruct',
      'gemma3:1b',
      'codellama:instruct',
      'codellama:7b-instruct-q4_0',
      'openrouter/gpt-4o',
      plannerModel,
      coderModel
    ])
  ).filter(Boolean);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('dashboardPrefs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          plannerModel?: string;
          coderModel?: string;
          ragK?: number;
          mainWidth?: number;
          widgetZones?: { header: string[]; main: string[]; secondary: string[]; footer: string[] };
          activeZone?: 'header' | 'main' | 'secondary' | 'footer';
        };
        if (parsed.plannerModel) setPlannerModel(parsed.plannerModel);
        if (parsed.coderModel) setCoderModel(parsed.coderModel);
        if (typeof parsed.ragK === 'number') setRagK(parsed.ragK);
        if (typeof parsed.mainWidth === 'number') setMainWidth(parsed.mainWidth);
        if (parsed.widgetZones) setWidgetZones(parsed.widgetZones);
        if (parsed.activeZone) setActiveZone(parsed.activeZone);
      } catch (e) {
        console.error('Failed to parse saved dashboard prefs', e);
      }
    }
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      plannerModel,
      coderModel,
      ragK,
      mainWidth,
      widgetZones,
      activeZone
    };
    window.localStorage.setItem('dashboardPrefs', JSON.stringify(payload));
  }, [plannerModel, coderModel, ragK, mainWidth, widgetZones, activeZone]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0));
        if (visible[0]?.target?.id && ['header', 'main', 'secondary', 'footer'].includes(visible[0].target.id)) {
          setActiveZone(visible[0].target.id as typeof activeZone);
        }
      },
      { threshold: [0.2, 0.4, 0.6] }
    );

    (Object.keys(zoneRefs) as (keyof typeof zoneRefs)[]).forEach((key) => {
      const el = zoneRefs[key].current;
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [tasksResponse, agentsResponse] = await Promise.all([
        axios.get('http://localhost:3001/tasks'),
        axios.get('http://localhost:3001/agents')
      ]);

      setTasks(tasksResponse.data);
      setAgents(agentsResponse.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch dashboard data');
      setLoading(false);
    }
  };

  const runPlan = async (task: Task) => {
    try {
      setLoading(true);
      const resp = await axios.post('http://localhost:7788/plan', {
        prompt: `${task.title}\n${task.description || ''}`.trim(),
        context: { useRAG: true, k: ragK },
        model: plannerModel
      });
      const body = resp.data.plan || JSON.stringify(resp.data);
      const meta: ResultMeta = {
        model: resp.data.modelTried || plannerModel,
        fallback: resp.data.fallbackTried ?? null
      };
      setResultModal({ title: 'Plan Result', body, meta });
      setLastResult({ title: 'Plan Result', body, meta });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to plan';
      const meta: ResultMeta = {
        model: err?.response?.data?.modelTried || plannerModel,
        fallback: err?.response?.data?.fallbackTried ?? null,
        error: detail,
        status
      };
      setResultModal({ title: 'Plan Error', body: detail, meta });
      setLastResult({ title: 'Plan Error', body: detail, meta });
      setToast({ text: `Plan failed (${meta.model || 'model'}): ${detail}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const runCodegen = async (task: Task) => {
    try {
      setLoading(true);
      const resp = await axios.post('http://localhost:7788/codegen', {
        prompt: `${task.title}\n${task.description || ''}`.trim(),
        context: { useRAG: true, k: ragK },
        model: coderModel
      });
      const body = resp.data.code || JSON.stringify(resp.data);
      const meta: ResultMeta = {
        model: resp.data.modelTried || coderModel,
        fallback: resp.data.fallbackTried ?? null
      };
      setResultModal({ title: 'Codegen Result', body, meta });
      setLastResult({ title: 'Codegen Result', body, meta });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Failed to codegen';
      const meta: ResultMeta = {
        model: err?.response?.data?.modelTried || coderModel,
        fallback: err?.response?.data?.fallbackTried ?? null,
        error: detail,
        status
      };
      setResultModal({ title: 'Codegen Error', body: detail, meta });
      setLastResult({ title: 'Codegen Error', body: detail, meta });
      setToast({ text: `Codegen failed (${meta.model || 'model'}): ${detail}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const renderMarkdown = (text: string) => {
    // Minimal markdown handling: code fences and line breaks
    const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const withCode = escaped.replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-900/80 border border-slate-700 rounded-md p-3 overflow-auto text-sm"><code>$1</code></pre>');
    const withBreaks = withCode.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>');
    return <div className="prose prose-invert max-w-none text-slate-100" dangerouslySetInnerHTML={{ __html: withBreaks }} />;
  };

  const openTaskModalForEdit = (task: Task) => {
    setTaskForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority
    });
    setEditingTaskId(task.id);
    setFormError('');
    setShowTaskModal(true);
  };

  const openAgentModalForEdit = (agent: Agent) => {
    setAgentForm({
      name: agent.name,
      displayName: agent.displayName,
      description: agent.description || '',
      capabilities: (agent.capabilities || []).join(', '),
      models: (agent.models || []).join(', ')
    });
    setEditingAgentId(agent.id);
    setFormError('');
    setShowAgentModal(true);
  };

  const deleteTask = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      setLoading(true);
      await axios.delete(`http://localhost:3001/tasks/${id}`);
      setToast({ text: 'Task deleted', type: 'success' });
      await fetchDashboardData();
    } catch (err) {
      setError('Failed to delete task');
      setLoading(false);
    }
  };

  const deleteAgent = async (id: string) => {
    if (!window.confirm('Delete this agent?')) return;
    try {
      setLoading(true);
      await axios.delete(`http://localhost:3001/agents/${id}`);
      setToast({ text: 'Agent deleted', type: 'success' });
      await fetchDashboardData();
    } catch (err) {
      setError('Failed to delete agent');
      setLoading(false);
    }
  };

  const handleTaskSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!taskForm.title.trim()) {
      setFormError('Title is required');
      return;
    }
    const allowedPriorities = ['low', 'medium', 'high', 'urgent'];
    const priority = allowedPriorities.includes(taskForm.priority) ? taskForm.priority : 'medium';
    try {
      setLoading(true);
      if (editingTaskId) {
        await axios.put(`http://localhost:3001/tasks/${editingTaskId}`, {
          title: taskForm.title.trim(),
          description: taskForm.description.trim(),
          priority
        });
        setToast({ text: 'Task updated', type: 'success' });
      } else {
        await axios.post('http://localhost:3001/tasks', {
          title: taskForm.title.trim(),
          description: taskForm.description.trim(),
          priority
        });
        setToast({ text: 'Task created', type: 'success' });
      }
      setShowTaskModal(false);
      setEditingTaskId(null);
      setTaskForm({ title: '', description: '', priority: 'medium' });
      await fetchDashboardData();
    } catch (err) {
      setFormError('Failed to create task');
      setLoading(false);
    }
  };

  const handleAgentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!agentForm.name.trim() || !agentForm.displayName.trim()) {
      setFormError('Name and display name are required');
      return;
    }
    try {
      setLoading(true);
      await axios.post('http://localhost:3001/agents/register', {
        name: agentForm.name.trim(),
        displayName: agentForm.displayName.trim(),
        description: agentForm.description.trim(),
        capabilities: agentForm.capabilities
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        models: agentForm.models
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        endpoints: {
          register: '/agents/register',
          delegate: '/tasks/delegate',
          status: '/agents/status'
        }
      });
      setToast({ text: editingAgentId ? 'Agent updated' : 'Agent registered', type: 'success' });
      setShowAgentModal(false);
      setEditingAgentId(null);
      setAgentForm({
        name: '',
        displayName: '',
        description: '',
        capabilities: 'task-management,agent-delegation',
        models: 'master-coordinator'
      });
      await fetchDashboardData();
    } catch (err) {
      setFormError('Failed to register agent');
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-200 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-200 text-blue-800';
      case 'completed':
        return 'bg-green-200 text-green-800';
      case 'failed':
        return 'bg-red-200 text-red-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'bg-gray-200 text-gray-800';
      case 'medium':
        return 'bg-blue-200 text-blue-800';
      case 'high':
        return 'bg-orange-200 text-orange-800';
      case 'urgent':
        return 'bg-red-200 text-red-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  const Skeleton = ({ rows = 3 }: { rows?: number }) => (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="h-4 rounded bg-slate-800/70 animate-pulse" />
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100 flex items-center justify-center">
        <div className="space-y-4 w-full max-w-3xl px-6">
          <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="h-6 w-32 bg-slate-800/80 rounded animate-pulse" />
              <div className="h-6 w-24 bg-slate-800/80 rounded animate-pulse" />
            </div>
            <Skeleton rows={4} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 shadow-lg">
              <Skeleton rows={5} />
            </div>
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 shadow-lg">
              <Skeleton rows={5} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium">Error: {error}</p>
        </div>
      </div>
    );
  }

  const filteredTasks = tasks.filter((task) => {
    const matchesStatus = taskStatusFilter === 'all' || task.status === taskStatusFilter;
    const matchesPriority = taskPriorityFilter === 'all' || task.priority === taskPriorityFilter;
    const q = taskSearch.trim().toLowerCase();
    const matchesSearch =
      q.length === 0 ||
      task.title.toLowerCase().includes(q) ||
      (task.description || '').toLowerCase().includes(q);
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const filteredAgents = agents.filter((agent) => {
    const q = agentSearch.trim().toLowerCase();
    if (q.length === 0) return true;
    return (
      agent.displayName.toLowerCase().includes(q) ||
      agent.name.toLowerCase().includes(q) ||
      (agent.description || '').toLowerCase().includes(q)
    );
  });

  const moveWidget = (widget: string, targetZone: keyof typeof widgetZones) => {
    setWidgetZones((prev) => {
      const next: typeof prev = {
        header: [],
        main: [],
        secondary: [],
        footer: []
      };
      (Object.keys(prev) as (keyof typeof prev)[]).forEach((zone) => {
        next[zone] = prev[zone].filter((w) => w !== widget);
      });
      next[targetZone] = [...next[targetZone], widget];
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, widget: string) => {
    e.dataTransfer.setData('widget', widget);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, zone: keyof typeof widgetZones) => {
    e.preventDefault();
    const widget = e.dataTransfer.getData('widget');
    if (widget) moveWidget(widget, zone);
  };

  const renderWidget = (widget: string) => {
    switch (widget) {
      case 'tasks':
        return (
          <div className="space-y-4">
            {filteredTasks.length === 0 && (
              <div className="border border-dashed border-slate-700 rounded-lg p-4 text-center text-slate-400 bg-slate-900/40">
                No tasks for these filters. Try clearing search/filters or adding a new task.
              </div>
            )}
            {filteredTasks.map((task: Task) => (
              <div
                key={task.id}
                className="border-l-4 border-gray-200 pl-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{task.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                    <div className="flex items-center mt-2 space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(task.status)}`}>
                        {task.status}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <p className="text-sm text-gray-500">
                      {new Date(task.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex space-x-2 justify-end">
                      <button
                        className="text-blue-600 hover:text-blue-800 text-sm"
                        onClick={() => openTaskModalForEdit(task)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 text-sm"
                        onClick={() => deleteTask(task.id)}
                      >
                        Delete
                      </button>
                      <button
                        className="text-indigo-600 hover:text-indigo-800 text-sm"
                        onClick={() => runPlan(task)}
                      >
                        Plan
                      </button>
                      <button
                        className="text-amber-600 hover:text-amber-800 text-sm"
                        onClick={() => runCodegen(task)}
                      >
                        Codegen
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      case 'agents':
        return (
          <div className="space-y-4">
            {filteredAgents.length === 0 && (
              <div className="border border-dashed border-slate-700 rounded-lg p-4 text-center text-slate-400 bg-slate-900/40">
                No agents for this search. Clear search or register a new agent.
              </div>
            )}
            {filteredAgents.map((agent: Agent) => (
              <div
                key={agent.id}
                className="border-l-4 border-gray-200 pl-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{agent.displayName}</h3>
                    <p className="text-sm text-gray-600">{agent.description}</p>
                    <div className="flex items-center mt-2 space-x-2">
                      <span className="px-2 py-1 rounded-full text-xs bg-blue-200 text-blue-800">
                        {agent.status}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs bg-gray-200 text-gray-800">
                        {agent.models.length} models
                      </span>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <p className="text-sm text-gray-500">
                      {new Date(agent.createdAt).toLocaleDateString()}
                    </p>
                    <div className="flex space-x-2 justify-end">
                      <button
                        className="text-blue-600 hover:text-blue-800 text-sm"
                        onClick={() => openAgentModalForEdit(agent)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 text-sm"
                        onClick={() => deleteAgent(agent.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      case 'result':
        return (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">Latest Plan/Codegen</h3>
            {lastResult ? (
              <div className="rounded border border-gray-200 bg-gray-50 p-3 max-h-64 overflow-auto text-sm whitespace-pre-wrap">
                <div className="text-xs uppercase text-gray-500 mb-2">{lastResult.title}</div>
                {lastResult.body}
              </div>
            ) : (
              <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-500">
                Run Plan or Codegen to see results here.
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const dropZoneClasses = 'min-h-[120px] border border-slate-800 rounded-xl p-4 bg-slate-900/50 backdrop-blur shadow-inner';

  const scrollToZone = (target: keyof typeof zoneRefs) => {
    const el = document.getElementById(target) || zoneRefs[target]?.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveZone(target);
  };

  const renderZone = (zone: keyof typeof widgetZones, title: string) => (
    <div
      className={dropZoneClasses}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDrop(e, zone)}
    >
      <div className="flex items-center justify-between mb-2 text-sm font-semibold text-gray-700">
        <span>{title}</span>
        <span className="text-gray-400">Drop widgets here</span>
      </div>
      <div className="space-y-3">
        {widgetZones[zone].map((w) => (
          <div
            key={`${zone}-${w}`}
            className="border border-gray-200 rounded-md bg-white shadow-sm"
            draggable
            onDragStart={(e) => handleDragStart(e, w)}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 cursor-move">
              <span className="text-sm font-medium text-gray-800 capitalize">{w}</span>
              <span className="text-gray-400 text-xs">⇅</span>
            </div>
            <div className="p-3">{renderWidget(w)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const startResizing = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setResizing(true);
  };

  const stopResizing = () => setResizing(false);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!resizing) return;
    const container = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - container.left;
    const percent = Math.min(75, Math.max(25, (relativeX / container.width) * 100));
    setMainWidth(percent);
  };

  return (
    <>
      <div
        className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100 flex"
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
                type="button"
                onClick={() => scrollToZone(item.target)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="px-4 py-4 text-xs text-slate-500 border-t border-slate-800">API: {new Date().toLocaleTimeString()}</div>
        </aside>

        <div className="flex-1 flex flex-col">
          <datalist id="modelOptionsList">
            {modelOptions.map((opt) => (
              <option key={opt} value={opt} />
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
                  <span className="text-slate-300">Layout</span>
                  <select
                    className="w-44 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    onChange={(e) => applyPreset(e.target.value as keyof typeof layoutPresets)}
                    defaultValue="balanced"
                  >
                    <option value="balanced">Balanced</option>
                    <option value="tasks-focused">Tasks Focused</option>
                    <option value="agents-focused">Agents Focused</option>
                  </select>
                </div>
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

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">{editingTaskId ? 'Edit Task' : 'New Task'}</h2>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setShowTaskModal(false);
                  setEditingTaskId(null);
                  setFormError('');
                }}
              >
                ✕
              </button>
            </div>
            {formError && <p className="text-red-600 mb-3 text-sm">{formError}</p>}
            <form className="space-y-4" onSubmit={handleTaskSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <select
                  className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setShowTaskModal(false);
                    setEditingTaskId(null);
                    setFormError('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  {editingTaskId ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agent Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">{editingAgentId ? 'Edit Agent' : 'Register Agent'}</h2>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setShowAgentModal(false);
                  setEditingAgentId(null);
                  setFormError('');
                }}
              >
                ✕
              </button>
            </div>
            {formError && <p className="text-red-600 mb-3 text-sm">{formError}</p>}
            <form className="space-y-4" onSubmit={handleAgentSubmit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">Name (unique)</label>
                <input
                  className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Display Name</label>
                <input
                  className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={agentForm.displayName}
                  onChange={(e) => setAgentForm({ ...agentForm, displayName: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={2}
                  value={agentForm.description}
                  onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Capabilities (comma separated)</label>
                <input
                  className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={agentForm.capabilities}
                  onChange={(e) => setAgentForm({ ...agentForm, capabilities: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Models (comma separated)</label>
                <input
                  className="mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={agentForm.models}
                  onChange={(e) => setAgentForm({ ...agentForm, models: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setShowAgentModal(false);
                    setEditingAgentId(null);
                    setFormError('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
                >
                  {editingAgentId ? 'Save Changes' : 'Register Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
            <div className="rounded border border-gray-200 bg-gray-50 p-3 max-h-96 overflow-auto text-sm text-gray-900">
              {renderMarkdown(resultModal.body)}
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
            className={`rounded-md px-4 py-3 shadow-lg text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}
            onAnimationEnd={() => setToast(null)}
          >
            {toast.text}
          </div>
        </div>
      )}
    </>
  );
}

export default Dashboard;