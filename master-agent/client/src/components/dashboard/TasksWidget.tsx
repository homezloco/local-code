import React, { useState, useCallback } from 'react';
import type { Task } from './types';
import { getStatusColor, getPriorityColor, CopyButton } from './helpers';
import ResultModal from './ResultModal';

interface TasksWidgetProps {
  filteredTasks: Task[];
  openTaskModalForEdit: (task: Task) => void;
  runPlan: (task: Task) => void;
  runCodegen: (task: Task) => void;
  onDelegate: (task: Task, opts?: { autonomous?: boolean }) => void;
  onViewCode?: (task: Task) => void;
  actionLoading?: boolean;
  onCancel?: (task: Task) => void;
  onArchive?: (task: Task) => void;
  onRetry?: (task: Task) => void;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '📋',
  delegated: '🔄',
  in_progress: '⏳',
  review: '👀',
  completed: '✅',
  failed: '❌',
};

interface FullResultModal {
  taskTitle: string;
  result: string;
  loading: boolean;
}

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const TasksWidget: React.FC<TasksWidgetProps> = ({
  filteredTasks,
  openTaskModalForEdit,
  runPlan,
  runCodegen,
  onDelegate,
  onViewCode,
  actionLoading,
  onCancel,
  onArchive,
  onRetry,
}) => {
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});
  const [autoFlags, setAutoFlags] = useState<Record<string, boolean>>({});
  const [fullResultModal, setFullResultModal] = useState<FullResultModal | null>(null);

  const formatResult = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const getResultPreview = (value: unknown, expanded: boolean): string => {
    const formatted = formatResult(value);
    if (expanded) return formatted;
    const limit = 400;
    return formatted.length > limit ? `${formatted.slice(0, limit)} …` : formatted;
  };

  const toggleResult = (id: string) => {
    setExpandedResults((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openFullResult = useCallback(async (task: Task, fallbackText: string) => {
    setFullResultModal({ taskTitle: task.title, result: formatResult(fallbackText), loading: true });
    try {
      const resp = await fetch(`${API}/api/delegate/${task.id}/delegations`);
      if (resp.ok) {
        const json = await resp.json();
        const delegations = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
        const latest = delegations?.[0];
        if (latest?.result) {
          setFullResultModal({ taskTitle: task.title, result: formatResult(latest.result), loading: false });
          return;
        }
      }
    } catch {
      // fallback to truncated text
    }
    setFullResultModal((prev) => prev ? { ...prev, loading: false } : null);
  }, []);

  return (
    <>
      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        {filteredTasks.length === 0 && (
          <div className="border border-dashed border-slate-700 rounded-lg p-4 text-center text-slate-400 bg-slate-900/40">
            No tasks for these filters. Try clearing search/filters or adding a new task.
          </div>
        )}
        {filteredTasks.map((task: Task) => {
          const status = task.status as string;
          const delegation = task.metadata?.lastDelegation as {
            agentName?: string;
            result?: unknown;
            completedAt?: string;
            needsClarification?: boolean;
          } | undefined;
          const lastError = task.metadata?.lastError as { error?: string; at?: string } | undefined;
          const isDelegated = status === 'delegated' || status === 'in_progress';
          const isFinished = status === 'completed' || status === 'review' || status === 'failed' || status === 'cancelled';

          return (
            <div
              key={task.id}
              className={`border-l-4 rounded-lg pl-4 py-3 transition-colors cursor-pointer ${status === 'completed' ? 'border-green-500 bg-green-900/10' :
                status === 'review' ? 'border-yellow-500 bg-yellow-900/10' :
                  status === 'failed' ? 'border-red-500 bg-red-900/10' :
                    isDelegated ? 'border-purple-500 bg-purple-900/10' :
                      'border-slate-600 bg-slate-800/40'
                } hover:bg-slate-700/30`}
              onClick={() => openFullResult(task, formatResult(delegation?.result ?? task.description ?? ''))}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white flex items-center gap-2">
                    <span>{STATUS_ICONS[status] || '📋'}</span>
                    {task.title}
                    {delegation?.needsClarification && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-amber-900/60 text-amber-100 border border-amber-700">
                        ⚠️ needs clarification
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-300 mt-1 break-words">{task.description}</p>
                  <div className="flex items-center mt-2 space-x-2 flex-wrap gap-y-1">
                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                    {task.assignedTo && (
                      <span className="px-2 py-1 rounded-full text-xs bg-purple-800 text-purple-200">
                        → {task.assignedTo}
                      </span>
                    )}
                    {isDelegated && (
                      <span className="px-2 py-1 rounded-full text-xs bg-purple-700 text-purple-100 animate-pulse">
                        Agent working...
                      </span>
                    )}
                  </div>

                  {status === 'completed' && delegation?.result !== undefined && delegation?.result !== null && (
                    <div className="mt-2 p-2 rounded-md bg-green-900/30 border border-green-800">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-green-300">✅ Agent Result:</p>
                        <div className="flex items-center gap-2">
                          <CopyButton text={formatResult(delegation.result)} />
                          <button
                            type="button"
                            className="text-xs text-green-400 hover:text-green-300 underline"
                            onClick={(e) => { e.stopPropagation(); toggleResult(task.id); }}
                          >
                            {expandedResults[task.id] ? 'Show Less' : 'Show Full'}
                          </button>
                        </div>
                      </div>
                      <pre
                        className={`text-xs text-green-200 whitespace-pre-wrap break-words break-all font-sans w-full max-w-full overflow-hidden ${expandedResults[task.id] ? 'max-h-[80vh] overflow-y-auto' : 'max-h-32'
                          }`}
                      >
                        {getResultPreview(delegation.result, Boolean(expandedResults[task.id]))}
                      </pre>
                      <div className="flex items-center justify-between mt-1">
                        {delegation.completedAt && (
                          <p className="text-xs text-green-400">Completed {new Date(delegation.completedAt).toLocaleString()}</p>
                        )}
                        <button
                          type="button"
                          className="text-xs px-2 py-0.5 rounded bg-green-800 hover:bg-green-700 text-green-200 hover:text-white transition-colors"
                          onClick={(e) => { e.stopPropagation(); openFullResult(task, formatResult(delegation.result ?? '')); }}
                        >
                          🔍 View Full Result
                        </button>
                      </div>
                    </div>
                  )}

                  {status === 'review' && delegation?.result !== undefined && delegation?.result !== null && (
                    <div className="mt-2 p-2 rounded-md bg-yellow-900/30 border border-yellow-800">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-yellow-300">👀 Needs Review:</p>
                        <div className="flex items-center gap-2">
                          <CopyButton text={formatResult(delegation.result)} />
                          <button
                            type="button"
                            className="text-xs text-yellow-400 hover:text-yellow-300 underline"
                            onClick={(e) => { e.stopPropagation(); toggleResult(task.id); }}
                          >
                            {expandedResults[task.id] ? 'Show Less' : 'Show Full'}
                          </button>
                        </div>
                      </div>
                      <pre
                        className={`text-xs text-yellow-200 whitespace-pre-wrap break-words break-all font-sans w-full max-w-full overflow-hidden ${expandedResults[task.id] ? 'max-h-[80vh] overflow-y-auto' : 'max-h-32'
                          }`}
                      >
                        {getResultPreview(delegation.result, Boolean(expandedResults[task.id]))}
                      </pre>
                      <div className="flex justify-end mt-1">
                        <button
                          type="button"
                          className="text-xs px-2 py-0.5 rounded bg-yellow-800 hover:bg-yellow-700 text-yellow-200 hover:text-white transition-colors"
                          onClick={() => openFullResult(task, formatResult(delegation.result ?? ''))}
                        >
                          🔍 View Full Result
                        </button>
                      </div>
                    </div>
                  )}

                  {status === 'failed' && lastError?.error && (
                    <div className="mt-2 p-2 rounded-md bg-red-900/30 border border-red-800">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-red-300">❌ Failed:</p>
                        <div className="flex items-center gap-2">
                          <CopyButton text={lastError.error} />
                          <button
                            type="button"
                            className="text-xs text-red-400 hover:text-red-300 underline"
                            onClick={(e) => { e.stopPropagation(); toggleResult(task.id); }}
                          >
                            {expandedResults[task.id] ? 'Show Less' : 'Show Full'}
                          </button>
                        </div>
                      </div>
                      <pre className={`text-xs text-red-200 whitespace-pre-wrap font-sans break-words ${expandedResults[task.id] ? 'max-h-[80vh] overflow-y-auto' : 'line-clamp-4'}`}>{lastError.error}</pre>
                      <div className="flex justify-end mt-1">
                        <button
                          type="button"
                          className="text-xs px-2 py-0.5 rounded bg-red-800 hover:bg-red-700 text-red-200 hover:text-white transition-colors"
                          onClick={(e) => { e.stopPropagation(); openFullResult(task, lastError.error || ''); }}
                        >
                          🔍 View Full Result
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right space-y-2 shrink-0 ml-3">
                  <p className="text-sm text-gray-400">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </p>
                  <div className="flex space-x-2 justify-end">
                    <button
                      type="button"
                      className="text-blue-400 hover:text-blue-300 text-sm"
                      onClick={(e) => { e.stopPropagation(); openTaskModalForEdit(task); }}
                    >
                      Edit
                    </button>
                    <label className="flex items-center gap-1 text-xs text-purple-200">
                      <input
                        type="checkbox"
                        className="accent-purple-500"
                        checked={!!autoFlags[task.id]}
                        onChange={(e) =>
                          setAutoFlags((prev) => ({ ...prev, [task.id]: e.target.checked }))
                        }
                      />
                      Autonomous
                    </label>
                    {!isFinished && (
                      <>
                        <button
                          type="button"
                          className="text-indigo-400 hover:text-indigo-300 text-sm"
                          onClick={(e) => { e.stopPropagation(); runPlan(task); }}
                        >
                          Plan
                        </button>
                        {onCancel && isDelegated && (
                          <button
                            type="button"
                            className="text-red-400 hover:text-red-300 text-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCancel(task);
                            }}
                            disabled={actionLoading}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-amber-400 hover:text-amber-300 text-sm"
                          onClick={(e) => { e.stopPropagation(); runCodegen(task); }}
                        >
                          Codegen
                        </button>
                      </>
                    )}
                    {isFinished && onArchive && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-200 text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive(task);
                        }}
                        disabled={actionLoading}
                      >
                        Archive
                      </button>
                    )}
                    {(status === 'failed' || status === 'cancelled') && onRetry && (
                      <button
                        type="button"
                        className="text-blue-400 hover:text-blue-200 text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetry(task);
                        }}
                        disabled={actionLoading}
                      >
                        Retry
                      </button>
                    )}
                    {isFinished && delegation && task.assignedTo === 'coding-agent' && onViewCode && (
                      <button
                        type="button"
                        className="text-emerald-400 hover:text-emerald-300 text-sm font-semibold"
                        onClick={(e) => { e.stopPropagation(); onViewCode(task); }}
                      >
                        💻 View Code
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-purple-400 hover:text-purple-300 text-sm font-semibold"
                      onClick={(e) => { e.stopPropagation(); onDelegate(task, { autonomous: !!autoFlags[task.id] }); }}
                      disabled={actionLoading || isDelegated}
                    >
                      {isDelegated ? '⏳ Working...' : isFinished ? '🔄 Re-delegate' : autoFlags[task.id] ? '🤖 Auto Delegate' : '🤖 Delegate'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {fullResultModal && (
        <ResultModal
          resultModal={{
            title: fullResultModal.taskTitle,
            body: fullResultModal.result || '',
            meta: { error: fullResultModal.result.startsWith('Error:') ? fullResultModal.result : undefined } // Basic error detection if any
          }}
          loading={fullResultModal.loading}
          onClose={() => setFullResultModal(null)}
        />
      )}
    </>
  );
};

export default TasksWidget;
