import React from 'react';

interface HeaderControlsProps {
  plannerModel: string;
  coderModel: string;
  useRag: boolean;
  ragK: number;
  reindexing: boolean;
  onPlannerChange: (value: string) => void;
  onCoderChange: (value: string) => void;
  onToggleRag: (checked: boolean) => void;
  onRagKChange: (value: number) => void;
  onReindex: () => void;
  onNewTask: () => void;
  onNewAgent: () => void;
  modelOptions: string[];
}

const HeaderControls: React.FC<HeaderControlsProps> = ({
  plannerModel,
  coderModel,
  useRag,
  ragK,
  reindexing,
  onPlannerChange,
  onCoderChange,
  onToggleRag,
  onRagKChange,
  onReindex,
  onNewTask,
  onNewAgent,
  modelOptions
}) => {
  return (
    <header className="bg-slate-900/70 border-b border-slate-800 shadow-lg backdrop-blur">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <button
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg shadow"
            onClick={onNewTask}
          >
            + New Task
          </button>
          <button
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2 rounded-lg shadow"
            onClick={onNewAgent}
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
              onChange={(e) => onPlannerChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300">Coder</span>
            <input
              list="modelOptionsList"
              className="w-44 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={coderModel}
              onChange={(e) => onCoderChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-700 bg-slate-800/80 text-blue-600 focus:ring-blue-500"
                checked={useRag}
                onChange={(e) => onToggleRag(e.target.checked)}
              />
              <span>RAG</span>
            </label>
            <input
              type="number"
              min={1}
              className="w-20 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              value={ragK}
              onChange={(e) => onRagKChange(Number(e.target.value) || 1)}
              disabled={!useRag}
            />
          </div>
          <button
            type="button"
            className={`px-3 py-2 rounded-md text-sm font-medium shadow ${
              reindexing ? 'bg-slate-700 text-slate-300 cursor-wait' : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
            onClick={onReindex}
            disabled={reindexing}
          >
            {reindexing ? 'Reindexing…' : 'Reindex RAG'}
          </button>
        </div>
      </div>
      <datalist id="modelOptionsList">
        {modelOptions.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </header>
  );
};

export default HeaderControls;
