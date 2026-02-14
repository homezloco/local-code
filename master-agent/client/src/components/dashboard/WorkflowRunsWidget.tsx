import React from 'react';
import { WorkflowRun } from './types';
import { Skeleton } from './helpers';

interface WorkflowRunsWidgetProps {
    workflowRuns: WorkflowRun[];
    loading: boolean;
    onRefresh: () => void;
}

const WorkflowRunsWidget: React.FC<WorkflowRunsWidgetProps> = ({
    workflowRuns,
    loading,
    onRefresh
}) => {
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
                    onClick={onRefresh}
                    disabled={loading}
                >
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>
            {loading ? (
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
};

export default WorkflowRunsWidget;
