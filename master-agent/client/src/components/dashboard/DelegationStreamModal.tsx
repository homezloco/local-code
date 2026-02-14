import React from 'react';
import DelegationTimeline, { DelegationEntry } from '../DelegationTimeline';

interface DelegationStreamModalProps {
    streamingTaskId: string | null;
    streamingTaskTitle: string;
    streamKey: string;
    delegationRunning: boolean;
    streamEntries: DelegationEntry[];
    onCancelTask: () => void;
    onClose: () => void;
}

const DelegationStreamModal: React.FC<DelegationStreamModalProps> = ({
    streamingTaskId,
    streamingTaskTitle,
    streamKey,
    delegationRunning,
    streamEntries,
    onCancelTask,
    onClose
}) => {
    if (!streamingTaskId) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                    <div>
                        <h2 className="text-lg font-semibold text-white">Live Delegation Stream</h2>
                        <p className="text-xs text-slate-400">{streamingTaskTitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {delegationRunning && (
                            <span className="text-[11px] px-2 py-1 rounded-full bg-green-900/50 text-green-200 border border-green-700">
                                Streaming
                            </span>
                        )}
                        <button
                            className="text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white border border-red-600"
                            onClick={onCancelTask}
                        >
                            Cancel Task
                        </button>
                        <button
                            className="text-slate-300 hover:text-white text-xl leading-none px-2"
                            onClick={onClose}
                        >
                            ✕
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-3">
                    <DelegationTimeline entries={streamEntries} title="Iteration Timeline" running={delegationRunning} />
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
    );
};

export default DelegationStreamModal;
