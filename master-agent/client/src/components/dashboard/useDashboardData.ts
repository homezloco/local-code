import { useState } from 'react';
import axios from 'axios';
import { useDashboardStore } from './store/dashboardStore';
import { StartupWorkflow, WorkflowRun } from './types';
import { TemplateDto } from '../../services/templatesClient';

const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const useDashboardData = () => {
    const {
        setTasks,
        setAgents,
        setTemplates,
        profileForm,
        setProfileForm
    } = useDashboardStore();

    const [loading, setLoading] = useState(true);
    const [startupWorkflows, setStartupWorkflows] = useState<StartupWorkflow[]>([]);
    const [startupWorkflowsLoading, setStartupWorkflowsLoading] = useState(false);
    const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
    const [workflowRunsLoading, setWorkflowRunsLoading] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState('');

    const refreshData = async () => {
        try {
            setLoading(true);
            const [tasksRes, agentsRes] = await Promise.all([
                axios.get(`${apiBase}/tasks`),
                axios.get(`${apiBase}/agents`)
            ]);
            setTasks(tasksRes.data || []);
            let agentsList = agentsRes.data || [];

            if (!agentsList.length) {
                try {
                    const bootstrapRes = await axios.post(`${apiBase}/agents/bootstrap`);
                    console.log('Bootstrapped agents:', bootstrapRes.data?.message);
                    const refreshed = await axios.get(`${apiBase}/agents`);
                    agentsList = refreshed.data || [];
                } catch (bootstrapErr) {
                    console.error('Failed to bootstrap agents', bootstrapErr);
                }
            }
            setAgents(agentsList);
        } catch (error) {
            console.error('Failed to fetch dashboard data', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTemplatesList = async () => {
        try {
            const res = await axios.get(`${apiBase}/templates`);
            setTemplates(res.data || []);
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

    const loadProfile = async () => {
        try {
            setProfileLoading(true);
            const res = await axios.get(`${apiBase}/profile`);
            if (res.data) setProfileForm(res.data);
        } catch (err) {
            console.error('Failed to load profile', err);
        } finally {
            setProfileLoading(false);
        }
    };

    const saveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileError('');
        try {
            setProfileLoading(true);
            await axios.post(`${apiBase}/profile`, profileForm);
            setProfileError('');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save profile';
            setProfileError(msg);
        } finally {
            setProfileLoading(false);
        }
    };

    return {
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
        profileError,
        setProfileError,
        loadProfile,
        saveProfile
    };
};
