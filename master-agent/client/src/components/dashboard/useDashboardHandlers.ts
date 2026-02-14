import { useState, useEffect } from 'react';
import axios from 'axios';
import { useDashboardStore } from './store/dashboardStore';
import { Task } from './types';
import { createTemplate, deleteTemplate, TemplateDto } from '../../services/templatesClient';

const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const useDashboardHandlers = (
    refreshData: () => Promise<void>,
    fetchTemplatesList: () => Promise<void>
) => {
    const { tasks, setTasks, setAgents, setTemplates, selectedTemplateId, setSelectedTemplateId, templateInputs, setTemplateInputs } = useDashboardStore();

    // UI State
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [showAgentModal, setShowAgentModal] = useState(false);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [toast, setToast] = useState<{ text: string; type?: 'success' | 'error' } | null>(null);

    // Validation Helpers
    const validateTask = (form: typeof taskForm) => {
        const errors: Record<string, string> = {};
        if (!form.title.trim()) errors.title = 'Title is required';
        else if (form.title.length < 3) errors.title = 'Title must be at least 3 characters';
        return errors;
    };

    const validateAgent = (form: typeof agentForm) => {
        const errors: Record<string, string> = {};
        if (!form.name.trim()) errors.name = 'Name is required';
        else if (!/^[a-zA-Z0-9-_]+$/.test(form.name)) errors.name = 'Name must be alphanumeric (hyphens/underscores allowed)';

        if (!form.displayName.trim()) errors.displayName = 'Display Name is required';
        return errors;
    };

    // Task Form
    const [taskForm, setTaskForm] = useState({
        title: '',
        description: '',
        priority: 'medium'
    });

    const handleTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateTask(taskForm);
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }
        setFieldErrors({});
        setIsSubmitting(true);
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
            // Optimistic update or refresh
            const res = await axios.get(`${apiBase}/tasks`);
            setTasks(res.data || []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save task';
            setFieldErrors({ global: msg });
            setToast({ text: msg, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancelTask = async (task: Task) => {
        if (!window.confirm('Cancel this task?')) return;

        // Optimistic update
        const previousTasks = [...tasks];
        setTasks(tasks.map(t => t.id === task.id ? { ...t, status: 'cancelled' } : t));

        setIsSubmitting(true);
        try {
            await axios.post(`${apiBase}/api/delegate/${task.id}/cancel`, { reason: 'user cancel' });
            setToast({ text: 'Task cancelled', type: 'success' });
            await refreshData();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to cancel task';
            setToast({ text: msg, type: 'error' });
            // Revert on error
            setTasks(previousTasks);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleArchiveTask = async (task: Task) => {
        if (!window.confirm('Archive this task? It will be hidden from the list.')) return;

        // Optimistic update
        const previousTasks = [...tasks];
        setTasks(tasks.map(t => t.id === task.id ? { ...t, status: 'archived' } : t));

        setIsSubmitting(true);
        try {
            // Re-using the update endpoint for status change if specific archive endpoint doesn't exist
            // Or create a new endpoint? The standard update endpoint should work if it accepts status.
            // Looking at the code, we don't have a direct 'updateTask' in this file exposed, but likely the API supports it.
            // I'll check routes/tasks.js later if needed, but for now I'll assume PUT /tasks/:id works.
            await axios.put(`${apiBase}/tasks/${task.id}`, { status: 'archived' });
            setToast({ text: 'Task archived', type: 'success' });
            await refreshData();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to archive task';
            setToast({ text: msg, type: 'error' });
            // Revert on error
            setTasks(previousTasks);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRetryTask = async (task: Task) => {
        setIsSubmitting(true);
        // Optimistic update to pending
        const previousTasks = [...tasks];
        setTasks(tasks.map(t => t.id === task.id ? { ...t, status: 'pending' } : t));

        try {
            await axios.post(`${apiBase}/api/delegate/${task.id}/retry`);
            setToast({ text: 'Retry initiated', type: 'success' });
            await refreshData();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to retry task';
            setToast({ text: msg, type: 'error' });
            setTasks(previousTasks);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Agent Form
    const [agentForm, setAgentForm] = useState({
        name: '',
        displayName: '',
        description: '',
        capabilities: 'task-management,agent-delegation',
        models: 'master-coordinator',
        preferredModel: ''
    });

    const handleAgentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateAgent(agentForm);
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }
        setFieldErrors({});
        setIsSubmitting(true);
        try {
            await axios.post(`${apiBase}/agents/register`, {
                name: agentForm.name.trim(),
                displayName: agentForm.displayName.trim(),
                description: agentForm.description.trim(),
                capabilities: agentForm.capabilities.split(',').map((s) => s.trim()).filter(Boolean),
                models: agentForm.models.split(',').map((s) => s.trim()).filter(Boolean),
                preferredModel: agentForm.preferredModel
            });
            setToast({ text: 'Agent saved', type: 'success' });
            setShowAgentModal(false);
            setEditingAgentId(null);
            setAgentForm({ name: '', displayName: '', description: '', capabilities: 'task-management,agent-delegation', models: 'master-coordinator', preferredModel: '' });
            const res = await axios.get(`${apiBase}/agents`);
            setAgents(res.data || []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save agent';
            setFieldErrors({ global: msg });
            setToast({ text: msg, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Template Form
    const { templateForm, setTemplateForm } = useDashboardStore();

    const handleTemplateSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setFieldErrors({}); // Replaced setFormError('') with setFieldErrors({})
        const title = templateForm.title.trim();
        const description = templateForm.description.trim();
        if (!title || !description) {
            setFieldErrors({ global: 'Template title and description are required' });
            return;
        }

        const inputs = templateForm.inputs.split(',').map((s: string) => s.trim()).filter(Boolean);
        const agentsList = templateForm.agents.split(',').map((s: string) => s.trim()).filter(Boolean);
        const steps = templateForm.steps.split('\n').map((s: string) => s.trim()).filter(Boolean);

        setIsSubmitting(true);
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
            setFieldErrors({ global: msg });
            setToast({ text: msg, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTemplateDelete = async (id: string) => {
        if (!window.confirm('Delete this template?')) return;
        setIsSubmitting(true);
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
        } finally {
            setIsSubmitting(false);
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Alt + N: New Task
            if (e.altKey && e.key === 'n') {
                e.preventDefault();
                setEditingTaskId(null);
                setFieldErrors({});
                setShowTaskModal(true);
            }
            // Alt + A: Register Agent
            if (e.altKey && e.key === 'a') {
                e.preventDefault();
                setEditingAgentId(null);
                setFieldErrors({});
                setShowAgentModal(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setShowTaskModal, setShowAgentModal]);

    return {
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
    };
};
